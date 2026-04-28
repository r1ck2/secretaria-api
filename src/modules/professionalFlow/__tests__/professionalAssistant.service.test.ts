/**
 * Unit tests for ProfessionalAssistantService
 *
 * All external dependencies are mocked. Tests verify:
 * - Text message routing to AIOrchestrator
 * - Audio message transcription via Whisper
 * - Error handling with Portuguese messages
 * - Correct professionalUserId forwarding
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfessionalAssistantService } from "../professionalAssistant.service";
import type {
  HandleProfessionalMessageParams,
  EvolutionWebhookPayload,
  ProfessionalAssistantDependencies,
  AIOrchestrator,
} from "../professionalAssistant.types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock Sequelize models
vi.mock("@/modules/setting/setting.entity", () => ({
  Setting: { findOne: vi.fn() },
}));
vi.mock("@/modules/adminAgent/adminAgent.entity", () => ({
  AdminAgent: { findOne: vi.fn() },
}));
vi.mock("@/modules/agent/agent.entity", () => ({
  Agent: { findOne: vi.fn() },
}));

// Mock OpenAI — factory must be self-contained (vi.mock is hoisted)
// We expose the mock via a module-level object so tests can configure it
const openAIMockState = {
  transcriptionsCreate: vi.fn(),
};

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      audio = {
        transcriptions: {
          create: (...args: any[]) => openAIMockState.transcriptionsCreate(...args),
        },
      };
    },
  };
});

// Alias for convenience in tests
const mockTranscriptionsCreate = openAIMockState.transcriptionsCreate;

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTextPayload(text: string): EvolutionWebhookPayload {
  return {
    event: "messages.upsert",
    instance: "test-instance",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "msg-1" },
      message: { conversation: text },
    },
  };
}

function makeAudioPayload(overrides: Partial<{
  mediaUrl: string;
  base64: string;
  mimetype: string;
}> = {}): EvolutionWebhookPayload {
  return {
    event: "messages.upsert",
    instance: "test-instance",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "msg-2" },
      message: {
        audioMessage: {
          mediaUrl: overrides.mediaUrl ?? "https://example.com/audio.ogg",
          mimetype: overrides.mimetype ?? "audio/ogg",
          ...(overrides.base64 ? { base64: overrides.base64 } : {}),
        },
      },
    },
  };
}

function makeParams(payload: EvolutionWebhookPayload, userId = "user-123"): HandleProfessionalMessageParams {
  return {
    fromNumber: "5511999999999",
    professionalUserId: userId,
    instanceName: "test-instance",
    instanceApikey: "test-apikey",
    rawPayload: payload,
  };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let mockAiOrchestrator: AIOrchestrator;
let mockEvolutionApiService: ProfessionalAssistantDependencies["evolutionApiService"];
let service: ProfessionalAssistantService;

beforeEach(async () => {
  vi.clearAllMocks();
  openAIMockState.transcriptionsCreate.mockReset();

  const { Setting } = await import("@/modules/setting/setting.entity");
  const { AdminAgent } = await import("@/modules/adminAgent/adminAgent.entity");
  const { Agent } = await import("@/modules/agent/agent.entity");

  // Default: no API key configured
  vi.mocked(Setting.findOne).mockResolvedValue(null);
  vi.mocked(AdminAgent.findOne).mockResolvedValue(null);
  vi.mocked(Agent.findOne).mockResolvedValue(null);

  mockAiOrchestrator = {
    receiveMessage: vi.fn().mockResolvedValue({ status: "completed" }),
  } as unknown as AIOrchestrator;

  mockEvolutionApiService = {
    sendTextMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProfessionalAssistantDependencies["evolutionApiService"];

  const deps: ProfessionalAssistantDependencies = {
    aiOrchestrator: mockAiOrchestrator,
    evolutionApiService: mockEvolutionApiService,
  };

  service = new ProfessionalAssistantService(deps);
});

// ─── Helper to set up API key ─────────────────────────────────────────────────

async function setupApiKey(key = "sk-test-key") {
  const { AdminAgent } = await import("@/modules/adminAgent/adminAgent.entity");
  vi.mocked(AdminAgent.findOne).mockResolvedValue({
    id: "admin-agent-1",
    openai_api_key: key,
    status: true,
  } as any);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProfessionalAssistantService", () => {
  // ── Test 1: Text message → AIOrchestrator called with correct params ─────────
  it("routes text message to AIOrchestrator with correct params", async () => {
    await setupApiKey();
    const payload = makeTextPayload("Quais são meus próximos agendamentos?");
    const params = makeParams(payload, "prof-user-456");

    await service.handleMessage(params);

    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: "5511999999999",
        message: "Quais são meus próximos agendamentos?",
        professionalUserId: "prof-user-456",
        toNumber: "5511999999999",
      })
    );
  });

  // ── Test 2: Audio message → Whisper called with correct model/language ────────
  it("transcribes audio with whisper-1 model and pt language, forwards with prefix", async () => {
    await setupApiKey("sk-audio-key");
    mockTranscriptionsCreate.mockResolvedValue({ text: "Olá, quero saber minha agenda" });

    // Mock fetch for audio download
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    const payload = makeAudioPayload({ mediaUrl: "https://example.com/audio.ogg" });
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect(mockTranscriptionsCreate).toHaveBeenCalledOnce();
    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        language: "pt",
      })
    );

    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[Áudio transcrito] Olá, quero saber minha agenda",
      })
    );
  });

  // ── Test 3: Audio download failure → Portuguese error, Whisper not called ─────
  it("sends Portuguese error when audio download fails, does not call Whisper", async () => {
    await setupApiKey();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const payload = makeAudioPayload({ mediaUrl: "https://example.com/missing.ogg" });
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Não foi possível baixar o áudio. Tente novamente ou envie uma mensagem de texto."
    );
  });

  // ── Test 4: Whisper API failure → Portuguese error, AIOrchestrator not called ─
  it("sends Portuguese error when Whisper fails, does not call AIOrchestrator", async () => {
    await setupApiKey();
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    mockTranscriptionsCreate.mockRejectedValue(new Error("OpenAI API error"));

    const payload = makeAudioPayload();
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Não foi possível transcrever o áudio. Tente novamente ou envie uma mensagem de texto."
    );
  });

  // ── Test 5: Blank transcription → Portuguese error, AIOrchestrator not called ─
  it("sends Portuguese error for blank transcription, does not call AIOrchestrator", async () => {
    await setupApiKey();
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    mockTranscriptionsCreate.mockResolvedValue({ text: "   " });

    const payload = makeAudioPayload();
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Não consegui entender o áudio. Poderia repetir ou enviar uma mensagem de texto?"
    );
  });

  // ── Test 6: No API key → Portuguese error, Whisper not called ────────────────
  it("sends Portuguese error when no API key is configured", async () => {
    // All mocks return null (no API key) — already set in beforeEach

    const payload = makeAudioPayload();
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Assistente não configurado. Configure um agente com chave OpenAI para usar esta funcionalidade."
    );
  });

  // ── Test 7: AIOrchestrator throws → Portuguese fallback sent ─────────────────
  it("sends Portuguese fallback when AIOrchestrator throws", async () => {
    await setupApiKey();
    (mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Orchestrator error"));

    const payload = makeTextPayload("Olá");
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em instantes."
    );
  });

  // ── Test 8: Correct professionalUserId passed to AIOrchestrator ──────────────
  it("passes correct professionalUserId to AIOrchestrator (Requirement 7.4)", async () => {
    await setupApiKey();
    const specificUserId = "specific-professional-uuid-789";
    const payload = makeTextPayload("Teste");
    const params = makeParams(payload, specificUserId);

    await service.handleMessage(params);

    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        professionalUserId: specificUserId,
      })
    );
  });

  // ── Additional: isAudioMessage detection ─────────────────────────────────────
  describe("isAudioMessage", () => {
    it("returns true for audioMessage payload", () => {
      const payload = makeAudioPayload();
      expect(service.isAudioMessage(payload)).toBe(true);
    });

    it("returns true for pttMessage payload", () => {
      const payload: EvolutionWebhookPayload = {
        event: "messages.upsert",
        instance: "test",
        data: {
          key: { remoteJid: "5511@s.whatsapp.net", fromMe: false, id: "1" },
          message: { pttMessage: { mediaUrl: "https://example.com/ptt.ogg", mimetype: "audio/ogg" } },
        },
      };
      expect(service.isAudioMessage(payload)).toBe(true);
    });

    it("returns true for documentMessage with audio MIME type", () => {
      const payload: EvolutionWebhookPayload = {
        event: "messages.upsert",
        instance: "test",
        data: {
          key: { remoteJid: "5511@s.whatsapp.net", fromMe: false, id: "1" },
          message: { documentMessage: { mediaUrl: "https://example.com/doc.mp3", mimetype: "audio/mpeg" } },
        },
      };
      expect(service.isAudioMessage(payload)).toBe(true);
    });

    it("returns false for text message payload", () => {
      const payload = makeTextPayload("Hello");
      expect(service.isAudioMessage(payload)).toBe(false);
    });

    it("returns false for documentMessage with non-audio MIME type", () => {
      const payload: EvolutionWebhookPayload = {
        event: "messages.upsert",
        instance: "test",
        data: {
          key: { remoteJid: "5511@s.whatsapp.net", fromMe: false, id: "1" },
          message: { documentMessage: { mediaUrl: "https://example.com/doc.pdf", mimetype: "application/pdf" } },
        },
      };
      expect(service.isAudioMessage(payload)).toBe(false);
    });
  });

  // ── Additional: extractAudioContent ──────────────────────────────────────────
  describe("extractAudioContent", () => {
    it("extracts mediaUrl from audioMessage", () => {
      const payload = makeAudioPayload({ mediaUrl: "https://example.com/audio.ogg", mimetype: "audio/ogg" });
      const content = service.extractAudioContent(payload);
      expect(content).not.toBeNull();
      expect(content!.type).toBe("url");
      expect(content!.value).toBe("https://example.com/audio.ogg");
      expect(content!.mimeType).toBe("audio/ogg");
    });

    it("extracts base64 from audioMessage when no URL", () => {
      const payload: EvolutionWebhookPayload = {
        event: "messages.upsert",
        instance: "test",
        data: {
          key: { remoteJid: "5511@s.whatsapp.net", fromMe: false, id: "1" },
          message: { audioMessage: { base64: "SGVsbG8=", mimetype: "audio/ogg" } },
        },
      };
      const content = service.extractAudioContent(payload);
      expect(content).not.toBeNull();
      expect(content!.type).toBe("base64");
      expect(content!.value).toBe("SGVsbG8=");
    });

    it("returns null for text-only payload", () => {
      const payload = makeTextPayload("Hello");
      expect(service.extractAudioContent(payload)).toBeNull();
    });
  });

  // ── Additional: resolveAudioBuffer ───────────────────────────────────────────
  describe("resolveAudioBuffer", () => {
    it("decodes base64 content to Buffer", async () => {
      const original = Buffer.from("Hello, World!");
      const b64 = original.toString("base64");
      const result = await service.resolveAudioBuffer({ type: "base64", value: b64, mimeType: "audio/ogg", filename: "audio.ogg" });
      expect(result).toEqual(original);
    });

    it("fetches URL content to Buffer", async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => data.buffer,
      });
      const result = await service.resolveAudioBuffer({ type: "url", value: "https://example.com/audio.ogg", mimeType: "audio/ogg", filename: "audio.ogg" });
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(4);
    });

    it("throws on non-2xx HTTP response", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
      await expect(
        service.resolveAudioBuffer({ type: "url", value: "https://example.com/audio.ogg", mimeType: "audio/ogg", filename: "audio.ogg" })
      ).rejects.toThrow();
    });
  });

  // ── Additional: unsupported MIME type ────────────────────────────────────────
  it("sends Portuguese error for unsupported audio MIME type", async () => {
    await setupApiKey();
    // audioMessage present (so isAudioMessage returns true) but with unsupported MIME type
    const payload: EvolutionWebhookPayload = {
      event: "messages.upsert",
      instance: "test",
      data: {
        key: { remoteJid: "5511@s.whatsapp.net", fromMe: false, id: "1" },
        message: {
          audioMessage: {
            mediaUrl: "https://example.com/audio.flac",
            mimetype: "audio/flac",
          },
        },
      },
    };
    const params = makeParams(payload);

    await service.handleMessage(params);

    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
    expect((mockAiOrchestrator.receiveMessage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((mockEvolutionApiService.sendTextMessage as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "test-instance",
      "test-apikey",
      "5511999999999",
      "Formato de áudio não suportado. Envie áudios em formato OGG, MP3, MP4, WebM ou WAV."
    );
  });
});
