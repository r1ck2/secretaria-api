import { Op } from "sequelize";
import OpenAI from "openai";
import { Appointment } from "@/modules/appointment/appointment.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { Setting } from "@/modules/setting/setting.entity";
import { Agent } from "@/modules/agent/agent.entity";
import { AdminAgent } from "@/modules/adminAgent/adminAgent.entity";
import { normalizePhoneNumber } from "@/utils/phoneNormalizer";
import {
  HandleProfessionalMessageParams,
  AudioContent,
  EvolutionWebhookPayload,
  SUPPORTED_AUDIO_MIME_TYPES,
  ProfessionalAssistantDependencies,
} from "./professionalAssistant.types";

export interface ProfessionalAssistantResult {
  message: string;
}

/**
 * Checks if a given phone number is the professional's own registered number (secretary_phone setting).
 */
export async function isProfessionalOwnNumber(fromNumber: string, professionalUserId: string): Promise<boolean> {
  const setting = await Setting.findOne({ where: { user_id: professionalUserId, key: "secretary_phone" } });
  if (!setting?.value) return false;

  const registered = setting.value.replace(/\D/g, "");
  const incoming = fromNumber.replace(/\D/g, "");

  // Match by suffix (last 11 digits) to handle country code variations
  const normalize = (n: string) => n.slice(-11);
  return normalize(registered) === normalize(incoming);
}

/**
 * Handles a message from the professional and returns a reply.
 */
export async function handleProfessionalMessage(
  message: string,
  professionalUserId: string
): Promise<ProfessionalAssistantResult> {
  const lower = message.toLowerCase().trim();

  // ── próximos agendamentos ──────────────────────────────────────────────────
  if (
    lower.includes("próximo") ||
    lower.includes("proximo") ||
    lower.includes("agenda") ||
    lower.includes("agendamento") ||
    lower.includes("consulta") ||
    lower.includes("hoje") ||
    lower.includes("amanhã") ||
    lower.includes("amanha") ||
    lower.includes("semana")
  ) {
    return getNextAppointments(professionalUserId, lower);
  }

  // ── total de agendamentos ──────────────────────────────────────────────────
  if (
    lower.includes("total") ||
    lower.includes("quantos") ||
    lower.includes("quantidade") ||
    lower.includes("count") ||
    lower.includes("número de") ||
    lower.includes("numero de")
  ) {
    return getTotalAppointments(professionalUserId, lower);
  }

  // ── fallback ───────────────────────────────────────────────────────────────
  return {
    message:
      "Olá! 👋 Sou sua assistente virtual.\n\n" +
      "No momento consigo te ajudar com:\n\n" +
      "📅 *Próximos agendamentos* — envie \"próximos agendamentos\" ou \"agenda de hoje\"\n" +
      "📊 *Total de agendamentos* — envie \"total de agendamentos\"\n\n" +
      "Outras funcionalidades em breve! 🚀",
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function getNextAppointments(
  userId: string,
  lower: string
): Promise<ProfessionalAssistantResult> {
  const now = new Date();
  let from = now;
  let to: Date | undefined;
  let label = "próximos";

  if (lower.includes("hoje")) {
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
    label = "de hoje";
  } else if (lower.includes("amanhã") || lower.includes("amanha")) {
    from = new Date(now);
    from.setDate(from.getDate() + 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
    label = "de amanhã";
  } else if (lower.includes("semana")) {
    to = new Date(now);
    to.setDate(to.getDate() + 7);
    label = "da semana";
  } else {
    to = new Date(now);
    to.setDate(to.getDate() + 7);
  }

  const where: any = {
    user_id: userId,
    status: "confirmed",
    start_at: { [Op.gte]: from, ...(to ? { [Op.lte]: to } : {}) },
  };

  const appointments = await Appointment.findAll({
    where,
    order: [["start_at", "ASC"]],
    limit: 10,
    include: [{ association: "customer", attributes: ["name", "phone"] }],
  });

  if (!appointments.length) {
    return { message: `Nenhum agendamento confirmado ${label}. 📭` };
  }

  const lines = appointments.map((a, i) => {
    const customer = (a as any).customer;
    const name = customer?.name || a.customer_phone;
    const date = new Date(a.start_at).toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return `${i + 1}. *${name}* — ${date}`;
  });

  return {
    message:
      `📅 *Agendamentos ${label}* (${appointments.length}):\n\n` +
      lines.join("\n"),
  };
}

async function getTotalAppointments(
  userId: string,
  lower: string
): Promise<ProfessionalAssistantResult> {
  const now = new Date();

  // Total confirmed upcoming
  const upcoming = await Appointment.count({
    where: { user_id: userId, status: "confirmed", start_at: { [Op.gte]: now } },
  });

  // Total this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const thisMonth = await Appointment.count({
    where: { user_id: userId, status: "confirmed", start_at: { [Op.between]: [monthStart, monthEnd] } },
  });

  // Total all time confirmed
  const allTime = await Appointment.count({ where: { user_id: userId, status: "confirmed" } });

  return {
    message:
      `📊 *Resumo de Agendamentos*\n\n` +
      `🔜 Próximos (confirmados): *${upcoming}*\n` +
      `📆 Este mês: *${thisMonth}*\n` +
      `✅ Total histórico: *${allTime}*`,
  };
}

// ─── ProfessionalAssistantService ────────────────────────────────────────────

/**
 * Class-based service that handles messages from the professional (own number).
 * Supports both text and audio (via Whisper transcription) messages.
 * All new logic lives here — isProfessionalOwnNumber above is unchanged.
 */
export class ProfessionalAssistantService {
  constructor(private deps: ProfessionalAssistantDependencies) {}

  // ── Task 2: API key resolution ──────────────────────────────────────────────

  /**
   * Resolves the OpenAI API key for the professional using the same priority
   * chain as AIOrchestrator.selectAgent:
   *   1. selected_agent_id setting → cad_agents_admin
   *   2. First active cad_agents_admin
   *   3. Professional's own cad_agents
   */
  async resolveApiKey(professionalUserId: string): Promise<string | null> {
    try {
      // 1. Check selected_agent_id setting
      const selectedAgentSetting = await Setting.findOne({
        where: { user_id: professionalUserId, key: "selected_agent_id" },
      });

      if (selectedAgentSetting?.value) {
        const adminAgent = await AdminAgent.findOne({
          where: { id: selectedAgentSetting.value, status: true },
        });
        if (adminAgent?.openai_api_key) {
          return adminAgent.openai_api_key;
        }
      }

      // 2. First active AdminAgent
      const firstAdminAgent = await AdminAgent.findOne({
        where: { status: true },
        order: [["created_at", "DESC"]],
      });
      if (firstAdminAgent?.openai_api_key) {
        return firstAdminAgent.openai_api_key;
      }

      // 3. Professional's own agent
      const ownAgent = await Agent.findOne({
        where: { user_id: professionalUserId, status: true },
        order: [["created_at", "DESC"]],
      });
      if (ownAgent?.openai_api_key) {
        return ownAgent.openai_api_key;
      }

      return null;
    } catch {
      return null;
    }
  }

  // ── Task 3: Audio detection and content extraction ──────────────────────────

  /**
   * Returns true when the Evolution API payload contains an audio message
   * (audioMessage, pttMessage, or documentMessage with a supported audio MIME type).
   */
  isAudioMessage(payload: EvolutionWebhookPayload): boolean {
    const msg = payload.data?.message;
    if (!msg) return false;

    if (msg.audioMessage) return true;
    if (msg.pttMessage) return true;
    if (msg.documentMessage) {
      const mime = msg.documentMessage.mimetype || "";
      return (SUPPORTED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
    }
    return false;
  }

  /**
   * Extracts audio content (URL or base64) from the Evolution API payload.
   * Checks audioMessage → pttMessage → documentMessage in order.
   * Returns null if no audio content can be extracted.
   */
  extractAudioContent(payload: EvolutionWebhookPayload): AudioContent | null {
    const msg = payload.data?.message;
    if (!msg) return null;

    // audioMessage
    if (msg.audioMessage) {
      const audio = msg.audioMessage;
      const value = audio.mediaUrl || audio.url || audio.base64 || null;
      if (!value) return null;
      const type = audio.base64 && !audio.mediaUrl && !audio.url ? "base64" : "url";
      return {
        type: audio.mediaUrl || audio.url ? "url" : "base64",
        value: audio.mediaUrl || audio.url || audio.base64!,
        mimeType: audio.mimetype || "audio/ogg",
        filename: "audio.ogg",
      };
    }

    // pttMessage
    if (msg.pttMessage) {
      const ptt = msg.pttMessage;
      const value = ptt.mediaUrl || ptt.url || ptt.base64 || null;
      if (!value) return null;
      return {
        type: ptt.mediaUrl || ptt.url ? "url" : "base64",
        value: ptt.mediaUrl || ptt.url || ptt.base64!,
        mimeType: ptt.mimetype || "audio/ogg",
        filename: "ptt.ogg",
      };
    }

    // documentMessage (only if audio MIME type)
    if (msg.documentMessage) {
      const doc = msg.documentMessage;
      const mime = doc.mimetype || "";
      if (!(SUPPORTED_AUDIO_MIME_TYPES as readonly string[]).includes(mime)) return null;
      const value = doc.mediaUrl || doc.url || doc.base64 || null;
      if (!value) return null;
      return {
        type: doc.mediaUrl || doc.url ? "url" : "base64",
        value: doc.mediaUrl || doc.url || doc.base64!,
        mimeType: mime || "audio/ogg",
        filename: doc.fileName || "audio.ogg",
      };
    }

    return null;
  }

  // ── Task 4: Resolve audio buffer ────────────────────────────────────────────

  /**
   * Downloads or decodes audio content to a Buffer.
   * - base64: decode directly
   * - url: fetch via HTTP (Node 18+ global fetch)
   */
  async resolveAudioBuffer(content: AudioContent): Promise<Buffer> {
    if (content.type === "base64") {
      return Buffer.from(content.value, "base64");
    }

    // URL fetch
    const response = await fetch(content.value);
    if (!response.ok) {
      throw new Error(
        `Falha ao baixar áudio: HTTP ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ── Task 5: Transcribe audio via Whisper ────────────────────────────────────

  /**
   * Sends audio buffer to OpenAI Whisper for transcription.
   * Uses model 'whisper-1' and language 'pt' for Brazilian Portuguese.
   */
  async transcribeAudio(
    buffer: Buffer,
    mimeType: string,
    apiKey: string
  ): Promise<string> {
    const openai = new OpenAI({ apiKey });

    // Derive filename from MIME type
    const mimeToExt: Record<string, string> = {
      "audio/ogg": "audio.ogg",
      "audio/mpeg": "audio.mp3",
      "audio/mp4": "audio.mp4",
      "audio/webm": "audio.webm",
      "audio/wav": "audio.wav",
    };
    const filename = mimeToExt[mimeType] || "audio.ogg";

    const file = new File([buffer], filename, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: "pt",
    });

    return transcription.text;
  }

  // ── Task 6: Main entry point ────────────────────────────────────────────────

  /**
   * Main entry point called from triggerFlowEvolution when isProfessionalOwnNumber is true.
   * Handles both text and audio messages.
   */
  async handleMessage(params: HandleProfessionalMessageParams): Promise<void> {
    const sendError = async (message: string) => {
      try {
        await this.deps.evolutionApiService.sendTextMessage(
          params.instanceName,
          params.instanceApikey,
          params.fromNumber,
          message
        );
      } catch (err) {
        this.logError("send_error_failed", err as Error, params);
      }
    };

    // 1. Resolve API key
    const apiKey = await this.resolveApiKey(params.professionalUserId);
    if (!apiKey) {
      await sendError(
        "Assistente não configurado. Configure um agente com chave OpenAI para usar esta funcionalidade."
      );
      return;
    }

    let messageText: string;

    // 2. Check if audio message
    if (this.isAudioMessage(params.rawPayload)) {
      // Audio path
      const audioContent = this.extractAudioContent(params.rawPayload);
      if (!audioContent) {
        await sendError(
          "Não foi possível baixar o áudio. Tente novamente ou envie uma mensagem de texto."
        );
        return;
      }

      // Check MIME type is supported
      if (!(SUPPORTED_AUDIO_MIME_TYPES as readonly string[]).includes(audioContent.mimeType)) {
        await sendError(
          "Formato de áudio não suportado. Envie áudios em formato OGG, MP3, MP4, WebM ou WAV."
        );
        return;
      }

      // Download audio
      let audioBuffer: Buffer;
      try {
        audioBuffer = await this.resolveAudioBuffer(audioContent);
      } catch (err) {
        this.logError("audio_download_failed", err as Error, params);
        await sendError(
          "Não foi possível baixar o áudio. Tente novamente ou envie uma mensagem de texto."
        );
        return;
      }

      // Transcribe
      let transcription: string;
      try {
        transcription = await this.transcribeAudio(audioBuffer, audioContent.mimeType, apiKey);
      } catch (err) {
        this.logError("whisper_failed", err as Error, params);
        await sendError(
          "Não foi possível transcrever o áudio. Tente novamente ou envie uma mensagem de texto."
        );
        return;
      }

      // Blank transcription check
      if (!transcription.trim()) {
        await sendError(
          "Não consegui entender o áudio. Poderia repetir ou enviar uma mensagem de texto?"
        );
        return;
      }

      messageText = "[Áudio transcrito] " + transcription;
    } else {
      // Text path
      messageText =
        params.rawPayload.data.message?.conversation ||
        params.rawPayload.data.message?.extendedTextMessage?.text ||
        "";
    }

    // 5. Call AIOrchestrator
    // Task 7: Session isolation is achieved naturally because the professional's
    // own phone number is used as the session key, which is different from any
    // customer phone number. The AIOrchestrator.receiveMessage creates/reuses
    // the session scoped to this phone + professionalUserId combination.
    try {
      await this.deps.aiOrchestrator.receiveMessage({
        phoneNumber: params.fromNumber,
        message: messageText,
        toNumber: params.fromNumber,
        professionalUserId: params.professionalUserId,
      });
    } catch (err) {
      this.logError("orchestrator_failed", err as Error, params);
      await sendError(
        "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em instantes."
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private logError(
    action: string,
    error: Error,
    params: HandleProfessionalMessageParams
  ): void {
    if (this.deps.logService) {
      this.deps.logService
        .create({
          level: "error",
          module: "professional_assistant",
          action,
          message: error.message,
          phone_number: params.fromNumber,
          user_id: params.professionalUserId,
          error_stack: error.stack,
        })
        .catch(() => {
          /* non-blocking */
        });
    }
  }
}
