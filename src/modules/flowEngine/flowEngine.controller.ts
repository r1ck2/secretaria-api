import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { FlowEngineService } from "./flowEngine.service";
import { FlowSession } from "./flowSession.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { WhatsappConnection } from "@/modules/whatsapp/whatsapp.entity";
import { evolutionApiService } from "@/modules/evolution/evolution.service";
import { logService } from "@/modules/log/log.service";
import { normalizePhoneNumber } from "@/utils/phoneNormalizer";

const engineService = new FlowEngineService();

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

    // Log Evolution webhook received
    await logService.logEvolution({
      action: "webhook_received",
      message: "Evolution webhook received",
      metadata: {
        event: payload.event,
        instance: payload.instance,
        payload_keys: Object.keys(payload),
      },
    });

    // Only handle MESSAGES_UPSERT events (support both formats)
    const eventType = payload.event?.toUpperCase().replace(/\./g, '_');
    if (eventType !== "MESSAGES_UPSERT") {
      await logService.logEvolution({
        action: "webhook_ignored",
        message: `Webhook ignored - event type: ${payload.event}`,
        metadata: { 
          event: payload.event,
          normalized_event: eventType,
          expected: "MESSAGES_UPSERT"
        },
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    const data = payload.data;
    if (!data) {
      await logService.logEvolution({
        level: "warn",
        action: "webhook_no_data",
        message: "Webhook received without data",
        metadata: { 
          payload: payload,
          payload_keys: Object.keys(payload),
          has_data: !!payload.data
        },
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    // Log the data structure for debugging
    await logService.logEvolution({
      action: "webhook_data_received",
      message: "Webhook data structure received",
      metadata: {
        data_keys: Object.keys(data),
        has_key: !!data.key,
        has_message: !!data.message,
        key_structure: data.key ? Object.keys(data.key) : null,
        message_structure: data.message ? Object.keys(data.message) : null,
      },
    });

    // Ignore outgoing messages
    if (data.key?.fromMe === true) {
      await logService.logEvolution({
        action: "webhook_outgoing_ignored",
        message: "Outgoing message ignored",
        metadata: { 
          remoteJid: data.key?.remoteJid,
          fromMe: data.key?.fromMe,
          key_structure: data.key ? Object.keys(data.key) : null
        },
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    // Extract sender number (strip WhatsApp suffixes and normalize)
    // Possible suffixes: @s.whatsapp.net, @lid, @g.us (groups)
    const remoteJid: string = data.key?.remoteJid || "";
    let rawNumber = remoteJid
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@g.us", "")
      .replace(/\D/g, "");
    
    // Check for special cases
    const isGroupChat = remoteJid.includes("@g.us");
    const isLidNumber = remoteJid.includes("@lid");
    
    // ── SPECIAL CASE: @lid numbers - extract actual phone from senderPn ──
    if (isLidNumber && data.key?.senderPn) {
      const senderPnRaw = data.key.senderPn.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const senderPnNormalization = normalizePhoneNumber(senderPnRaw);
      
      if (senderPnNormalization.isValid) {
        await logService.logEvolution({
          level: "info",
          action: "webhook_lid_number_resolved",
          message: "LID number detected - using senderPn as actual phone",
          phone_number: senderPnNormalization.full,
          metadata: { 
            remoteJid,
            lid_number: rawNumber,
            senderPn: data.key.senderPn,
            actual_number: senderPnNormalization.full,
          },
        });
        
        // Use senderPn as the actual phone number
        rawNumber = senderPnRaw;
      }
    }
    
    // Normalize the phone number
    const phoneNormalization = normalizePhoneNumber(rawNumber);
    const fromNumber = phoneNormalization.full; // Use FULL phone with country code
    
    await logService.logEvolution({
      action: "webhook_number_extraction",
      message: `Extracting and normalizing phone number from webhook`,
      phone_number: fromNumber,
      metadata: {
        remoteJid,
        raw_number: rawNumber,
        normalized_number: phoneNormalization.normalized,
        full_number: fromNumber,
        country_code: phoneNormalization.countryCode,
        is_valid: phoneNormalization.isValid,
        extraction_success: !!fromNumber,
        suffix_detected: isLidNumber ? "@lid" : isGroupChat ? "@g.us" : "@s.whatsapp.net",
        used_senderPn: isLidNumber && data.key?.senderPn,
      },
    });

    // ── Ignore group chats ──
    if (isGroupChat) {
      await logService.logEvolution({
        level: "info",
        action: "webhook_group_message_ignored",
        message: "Group message ignored (not processing group chats)",
        metadata: { 
          remoteJid,
          raw_number: rawNumber,
        },
      });
      return res.status(200).json({ success: true, ignored: true, reason: "group_chat" });
    }
    
    // ── Validate phone number ──
    if (!fromNumber || !phoneNormalization.isValid) {
      await logService.logEvolution({
        level: "warn",
        action: "webhook_invalid_number",
        message: "Invalid or missing phone number after normalization",
        metadata: { 
          remoteJid,
          raw_number: rawNumber,
          normalized_number: phoneNormalization.normalized,
          full_number: fromNumber,
          is_valid: phoneNormalization.isValid,
          key_structure: data.key ? Object.keys(data.key) : null,
          full_key: data.key,
          is_lid: isLidNumber,
          senderPn: data.key?.senderPn,
        },
      });
      return res.status(200).json({ success: true, ignored: true, reason: "invalid_number" });
    }

    // Extract message text
    const messageText: string =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      "";

    await logService.logEvolution({
      action: "webhook_message_extraction",
      message: `Extracting message text from webhook`,
      phone_number: fromNumber,
      metadata: {
        message_structure: data.message ? Object.keys(data.message) : null,
        has_conversation: !!data.message?.conversation,
        has_extended_text: !!data.message?.extendedTextMessage?.text,
        message_preview: messageText.substring(0, 100),
        message_length: messageText.length,
      },
    });

    if (!messageText.trim()) {
      await logService.logEvolution({
        action: "webhook_empty_message",
        message: "Empty message received",
        phone_number: fromNumber,
        metadata: { 
          messageType: data.message ? Object.keys(data.message) : [],
          full_message_object: data.message
        },
      });
      return res.status(200).json({ success: true, ignored: true });
    }

    // Find professional's connection by instance name
    const instanceName: string = payload.instance || "";
    const conn = await WhatsappConnection.findOne({
      where: { evolution_instance_name: instanceName },
    });

    if (!conn) {
      await logService.logEvolution({
        level: "warn",
        action: "webhook_connection_not_found",
        message: `No connection found for instance: ${instanceName}`,
        phone_number: fromNumber,
        metadata: { instanceName },
      });
      console.warn(`[Evolution Webhook] No connection found for instance: ${instanceName}`);
      return res.status(200).json({ success: true, ignored: true });
    }

    // Log message processing start
    await logService.logEvolution({
      action: "message_processing_start",
      message: `Processing message from ${fromNumber}`,
      phone_number: fromNumber,
      user_id: conn.user_id,
      metadata: {
        instanceName,
        messagePreview: messageText.substring(0, 100),
        connectionId: conn.id,
      },
    });

    // Use phone_number if available, otherwise fall back to user_id-based flow resolution
    const toNumber = conn.phone_number || undefined;
    const flowUserId = conn.user_id;

    // Run flow engine — pass toNumber if available, otherwise engine will use user_id via context
    const results = await engineService.receiveMessage(fromNumber, messageText, undefined, toNumber, flowUserId);

    // AI Orchestrator handles sending internally — just log and return
    if (results.length === 1 && results[0].node_type === 'ai_orchestrator') {
      const aiResult = results[0];
      const messagesSent = aiResult.output?.messages_sent?.length ?? 0;
      await logService.logEvolution({
        action: "message_processing_complete",
        message: `AI Orchestrator completed - ${messagesSent} messages sent`,
        phone_number: fromNumber,
        user_id: conn.user_id,
        metadata: {
          nodesExecuted: 1,
          messagesSent,
          status: aiResult.status,
          tools_executed: aiResult.output?.tools_executed,
        },
      });
      return res.status(200).json({ success: true });
    }

    // Send each message_sent result back via Evolution (FlowEngine path)
    if (conn.evolution_instance_name && conn.evolution_instance_apikey) {
      let messagesSent = 0;
      const sentMessages = new Set<string>(); // Track messages already sent to prevent duplicates
      
      for (const result of results) {
        const msg = result.output?.message_sent;
        if (msg && typeof msg === "string" && msg.trim()) {
          // Check if message was already sent (deduplication)
          if (sentMessages.has(msg)) {
            await logService.logEvolution({
              action: "message_duplicate_skipped",
              message: `Duplicate message skipped`,
              phone_number: fromNumber,
              user_id: conn.user_id,
              metadata: {
                instanceName: conn.evolution_instance_name,
                messagePreview: msg.substring(0, 100),
                nodeType: result.node_type,
              },
            });
            continue; // Skip duplicate message
          }
          
          try {
            await evolutionApiService.sendTextMessage(
              conn.evolution_instance_name,
              conn.evolution_instance_apikey,
              fromNumber,
              msg
            );
            sentMessages.add(msg); // Mark message as sent
            messagesSent++;

            await logService.logEvolution({
              action: "message_sent",
              message: `Message sent via Evolution API`,
              phone_number: fromNumber,
              user_id: conn.user_id,
              metadata: {
                instanceName: conn.evolution_instance_name,
                messagePreview: msg.substring(0, 100),
                nodeType: result.node_type,
              },
            });
          } catch (sendErr: any) {
            await logService.logEvolution({
              level: "error",
              action: "message_send_failed",
              message: `Failed to send message via Evolution API: ${sendErr.message}`,
              phone_number: fromNumber,
              user_id: conn.user_id,
              error: sendErr,
              metadata: {
                instanceName: conn.evolution_instance_name,
                nodeType: result.node_type,
              },
            });
            console.error("[Evolution Webhook] Failed to send message:", sendErr.message);
          }
        }
      }

      // Log processing completion
      await logService.logEvolution({
        action: "message_processing_complete",
        message: `Message processing completed - ${results.length} nodes executed, ${messagesSent} messages sent`,
        phone_number: fromNumber,
        user_id: conn.user_id,
        metadata: {
          nodesExecuted: results.length,
          messagesSent,
          instanceName,
        },
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    // Log Evolution webhook error
    await logService.logEvolution({
      level: "error",
      action: "webhook_error",
      message: `Evolution webhook error: ${error.message}`,
      error,
      metadata: {
        payload: req.body,
        errorStack: error.stack,
      },
    });

    console.error("[Evolution Webhook] Error:", error.message);
    // Always return 200 to Evolution so it doesn't retry
    return res.status(200).json({ success: false, message: error.message });
  }
}
