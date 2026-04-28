import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { FlowEngineService } from "./flowEngine.service";
import { FlowSession } from "./flowSession.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { WhatsappConnection } from "@/modules/whatsapp/whatsapp.entity";
import { evolutionApiService } from "@/modules/evolution/evolution.service";
import { logService } from "@/modules/log/log.service";
import { normalizePhoneNumber } from "@/utils/phoneNormalizer";
import { isProfessionalOwnNumber } from "@/modules/professionalFlow/professionalAssistant.service";
import { ProfessionalAssistantService } from "@/modules/professionalFlow/professionalAssistant.service";
import { orchestrator as aiOrchestrator } from "@/modules/aiOrchestrator/ai-orchestrator.controller";
import { isEchoFromProfessional } from "@/modules/flowEngine/professionalEchoDedup";

const engineService = new FlowEngineService();

// Instantiate ProfessionalAssistantService with shared singletons
const professionalAssistantService = new ProfessionalAssistantService({
  aiOrchestrator,
  evolutionApiService,
  logService: {
    create: (data: Record<string, unknown>) => logService.create(data as any).then(() => undefined),
  },
});

/**
 * POST /api/v1/flow/trigger
 *
 * Entry point for the flow engine. Receives a message from a phone number,
 * finds or creates a session, and executes the flow nodes.
 *
 * Body:
 *   phone_number  string  — The sender's phone number (client)
 *   to_number     string  — The recipient's phone number (professional's WhatsApp number)
 *                           Used to identify which professional/flow should handle the message
 *                           via cad_whatsapp_connections.phone_number -> user_id -> active flow
 *   message       string  — The message content
 *   flow_id?      string  — Optional: force a specific flow (overrides to_number lookup)
 *   slot_choice?  number  — Optional: slot index when user is choosing a time slot
 */
export async function triggerFlow(req: Request, res: Response) {
  try {
    const { phone_number, to_number, message, flow_id, slot_choice } = req.body;

    // Log flow trigger start
    await logService.logFlowAutomation({
      action: "trigger_flow_start",
      message: `Flow trigger initiated for phone ${phone_number}`,
      phone_number,
      metadata: {
        to_number,
        flow_id,
        slot_choice,
        message_preview: message?.substring(0, 100),
      },
    });

    if (!phone_number || !message) {
      await logService.logFlowAutomation({
        level: "warn",
        action: "trigger_flow_validation_error",
        message: "Missing required fields: phone_number or message",
        phone_number,
        metadata: { to_number, flow_id },
      });

      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: "phone_number and message are required.",
      });
    }

    if (!to_number && !flow_id) {
      await logService.logFlowAutomation({
        level: "warn",
        action: "trigger_flow_validation_error",
        message: "Missing routing information: to_number or flow_id required",
        phone_number,
      });

      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: "Either to_number (professional's WhatsApp number) or flow_id is required.",
      });
    }

    // If user is choosing a slot, inject into context before processing
    if (slot_choice !== undefined) {
      const session = await FlowSession.findOne({
        where: { phone_number, status: "waiting_input" },
        order: [["created_at", "DESC"]],
      });
      if (session) {
        const ctx = session.getContext();
        const slots: any[] = ctx.slots || [];
        const chosen = slots.find((s: any) => s.index === Number(slot_choice)) || slots[0];
        if (chosen) {
          ctx.chosen_slot = chosen;
          session.setContext(ctx);
          await session.save();

          await logService.logFlowAutomation({
            action: "slot_choice_processed",
            message: `Slot choice ${slot_choice} processed for session`,
            phone_number,
            session_id: session.id,
            metadata: { chosen_slot: chosen },
          });
        }
      }
    }

    const results = await engineService.receiveMessage(phone_number, message, flow_id, to_number);

    const customer = await Customer.findOne({ where: { phone: phone_number } });

    // Log successful flow execution
    await logService.logFlowAutomation({
      action: "trigger_flow_success",
      message: `Flow executed successfully with ${results.length} nodes`,
      phone_number,
      user_id: customer?.user_id,
      metadata: {
        nodes_executed: results.length,
        customer_id: customer?.id,
        routed_to: to_number,
        results_summary: results.map(r => ({ node_type: r.node_type, status: r.status })),
      },
    });

    return res.json({
      success: true,
      data: {
        customer: customer
          ? { id: customer.id, name: customer.name, phone: customer.phone }
          : { phone: phone_number, name: "Unknown" },
        routed_to: to_number || null,
        nodes_executed: results.length,
        results,
        last_message: results.findLast(r =>
          ["send_message", "confirm_cancellation", "cancel_appointment"].includes(r.node_type) &&
          (r.output.message_sent || r.output.message_override)
        )?.output?.message_sent || results.findLast(r => r.output.message_sent || r.output.message_override)?.output?.message_override || null,
        session_status: results[results.length - 1]?.status || "unknown",
      },
    });
  } catch (error: any) {
    // Log flow execution error
    await logService.logFlowAutomation({
      level: "error",
      action: "trigger_flow_error",
      message: `Flow execution failed: ${error.message}`,
      phone_number: req.body.phone_number,
      error,
      metadata: {
        to_number: req.body.to_number,
        flow_id: req.body.flow_id,
        error_details: error.stack,
      },
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Flow engine error.",
    });
  }
}

/**
 * GET /api/v1/flow/session/:phone
 * Returns the current active session for a phone number (for debugging).
 */
export async function getSession(req: Request, res: Response) {
  try {
    const { phone } = req.params;
    const session = await FlowSession.findOne({
      where: { phone_number: phone },
      order: [["created_at", "DESC"]],
    });

    if (!session) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "No session found." });
    }

    return res.json({
      success: true,
      data: {
        id: session.id,
        flow_id: session.flow_id,
        phone_number: session.phone_number,
        current_node_id: session.current_node_id,
        status: session.status,
        context: session.getContext(),
        history: session.getHistory(),
        created_at: session.createdAt,
        updated_at: session.updatedAt,
      },
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/v1/flow/session/:phone
 * Resets (closes) the active session for a phone number.
 */
export async function resetSession(req: Request, res: Response) {
  try {
    const { phone } = req.params;
    await FlowSession.update(
      { status: "completed" },
      { where: { phone_number: phone, status: ["active", "waiting_input"] } }
    );
    return res.json({ success: true, message: "Session reset." });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/flow/trigger/evolution
 *
 * Webhook endpoint for Evolution API MESSAGES_UPSERT events.
 * Receives incoming WhatsApp messages, routes them through the flow engine,
 * and sends responses back via the professional's Evolution instance.
 */
export async function triggerFlowEvolution(req: Request, res: Response) {
  try {
    const payload = req.body;

    // Only handle MESSAGES_UPSERT events
    const eventType = payload.event?.toUpperCase().replace(/\./g, '_');
    if (eventType !== "MESSAGES_UPSERT") {
      return res.status(200).json({ success: true, ignored: true });
    }

    const data = payload.data;
    if (!data) {
      return res.status(200).json({ success: true, ignored: true });
    }

    // Ignore outgoing messages
    if (data.key?.fromMe === true) {
      return res.status(200).json({ success: true, ignored: true });
    }

    // Extract sender number
    const remoteJid: string = data.key?.remoteJid || "";
    let rawNumber = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@g.us", "")
      .replace(/\D/g, "");

    const isGroupChat = remoteJid.includes("@g.us");
    const isLidNumber = remoteJid.includes("@lid");

    if (isGroupChat) {
      return res.status(200).json({ success: true, ignored: true, reason: "group_chat" });
    }

    // Resolve @lid numbers via senderPn
    if (isLidNumber && data.key?.senderPn) {
      const senderPnRaw = data.key.senderPn.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const senderPnNorm = normalizePhoneNumber(senderPnRaw);
      if (senderPnNorm.isValid) rawNumber = senderPnRaw;
    }

    const phoneNormalization = normalizePhoneNumber(rawNumber);
    const fromNumber = phoneNormalization.full;

    if (!fromNumber || !phoneNormalization.isValid) {
      await logService.logEvolution({
        level: "warn",
        action: "webhook_invalid_number",
        message: `Número inválido após normalização: ${rawNumber}`,
        metadata: { remoteJid, raw_number: rawNumber },
      });
      return res.status(200).json({ success: true, ignored: true, reason: "invalid_number" });
    }

    // Extract message text
    const messageText: string =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      "";

    // Extract sender name
    const senderName: string = data.pushName || data.key?.pushName || "";

    // Find professional's connection by instance name
    const instanceName: string = payload.instance || "";
    const conn = await WhatsappConnection.findOne({
      where: { evolution_instance_name: instanceName },
    });

    if (!conn) {
      await logService.logEvolution({
        level: "warn",
        action: "webhook_connection_not_found",
        message: `Instância não encontrada: ${instanceName}`,
        phone_number: fromNumber,
        metadata: { instanceName },
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    await logService.logEvolution({
      action: "message_received",
      message: `📨 Mensagem recebida de ${fromNumber}${senderName ? ` (${senderName})` : ''}: "${messageText.slice(0, 100)}"`,
      phone_number: fromNumber,
      user_id: conn.user_id,
      metadata: { instanceName, senderName, message_preview: messageText.slice(0, 200) },
    });

    const toNumber = conn.phone_number || undefined;
    const flowUserId = conn.user_id;

    // ── Professional own-number check ─────────────────────────────────────────
    // If the sender is the professional themselves (secretary_phone setting),
    // route to the professional assistant flow — never touch the customer flow.
    // NOTE: We check this BEFORE the empty-text guard so audio messages (which
    // have no conversation text) can still reach the professional assistant.
    const isOwnNumber = await isProfessionalOwnNumber(fromNumber, flowUserId);
    if (isOwnNumber) {
      // ── Echo detection (in-memory, race-condition-free) ─────────────────────
      // When the AI sends a response to the professional's own number, Evolution
      // fires a second MESSAGES_UPSERT webhook for that delivery (fromMe: false).
      // We check the in-memory set populated by markSentToProfessional() which
      // is called right before sendWhatsApp — no DB race condition.
      if (messageText.trim() && isEchoFromProfessional(fromNumber, messageText)) {
        await logService.logEvolution({
          action: "professional_echo_ignored",
          message: `🔇 Echo da resposta da IA ignorado para ${fromNumber}`,
          phone_number: fromNumber,
          user_id: flowUserId,
          metadata: { instanceName, preview: messageText.slice(0, 80) },
        });
        return res.status(200).json({ success: true, ignored: true, reason: "ai_echo" });
      }
      // ────────────────────────────────────────────────────────────────────────

      await logService.logEvolution({
        action: "professional_assistant_triggered",
        message: `📱 Mensagem do próprio profissional (${fromNumber}) — roteando para assistente`,
        phone_number: fromNumber,
        user_id: flowUserId,
        metadata: { instanceName, messagePreview: messageText.slice(0, 100) },
      });

      await professionalAssistantService.handleMessage({
        fromNumber,
        professionalUserId: flowUserId,
        instanceName: conn.evolution_instance_name ?? "",
        instanceApikey: conn.evolution_instance_apikey ?? "",
        rawPayload: payload,
      });

      return res.status(200).json({ success: true, professional_flow: true });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // For non-professional messages, ignore if there is no text content
    if (!messageText.trim()) {
      return res.status(200).json({ success: true, ignored: true });
    }

    const results = await engineService.receiveMessage(fromNumber, messageText, undefined, toNumber, flowUserId, senderName || undefined);

    // AI Orchestrator handles sending internally
    if (results.length === 1 && results[0].node_type === 'ai_orchestrator') {
      const aiResult = results[0];
      const messagesSent = aiResult.output?.messages_sent ?? [];
      await logService.logEvolution({
        action: "message_processing_complete",
        message: `✅ AI Orchestrator concluído — ${messagesSent.length} msg(s) enviada(s) para ${fromNumber}`,
        phone_number: fromNumber,
        user_id: conn.user_id,
        metadata: {
          messages_sent_count: messagesSent.length,
          tools_executed: aiResult.output?.tools_executed?.map((t: any) => t.tool_name),
          status: aiResult.status,
        },
      });
      return res.status(200).json({ success: true });
    }

    // FlowEngine path — send messages via Evolution
    if (conn.evolution_instance_name && conn.evolution_instance_apikey) {
      let messagesSent = 0;
      const sentMessages = new Set<string>();

      for (const result of results) {
        const msg = result.output?.message_sent;
        if (msg && typeof msg === "string" && msg.trim() && !sentMessages.has(msg)) {
          try {
            await evolutionApiService.sendTextMessage(
              conn.evolution_instance_name,
              conn.evolution_instance_apikey,
              fromNumber,
              msg
            );
            sentMessages.add(msg);
            messagesSent++;
          } catch (sendErr: any) {
            await logService.logEvolution({
              level: "error",
              action: "message_send_failed",
              message: `❌ Falha ao enviar mensagem para ${fromNumber}: ${sendErr.message}`,
              phone_number: fromNumber,
              user_id: conn.user_id,
              error: sendErr,
            });
          }
        }
      }

      await logService.logEvolution({
        action: "message_processing_complete",
        message: `✅ FlowEngine concluído — ${results.length} nó(s) executado(s), ${messagesSent} msg(s) enviada(s) para ${fromNumber}`,
        phone_number: fromNumber,
        user_id: conn.user_id,
        metadata: { nodes_executed: results.length, messages_sent: messagesSent },
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    await logService.logEvolution({
      level: "error",
      action: "webhook_error",
      message: `❌ Erro no webhook Evolution: ${error.message}`,
      error,
      metadata: { errorStack: error.stack },
    });
    console.error("[Evolution Webhook] Error:", error.message);
    return res.status(200).json({ success: false, message: error.message });
  }
}
