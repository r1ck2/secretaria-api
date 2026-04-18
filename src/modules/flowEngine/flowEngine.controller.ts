import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { FlowEngineService } from "./flowEngine.service";
import { FlowSession } from "./flowSession.entity";
import { Customer } from "@/modules/customer/customer.entity";

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

    if (!phone_number || !message) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
        success: false,
        message: "phone_number and message are required.",
      });
    }

    if (!to_number && !flow_id) {
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
        }
      }
    }

    const results = await engineService.receiveMessage(phone_number, message, flow_id, to_number);

    const customer = await Customer.findOne({ where: { phone: phone_number } });

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
        created_at: session.created_at,
        updated_at: session.updated_at,
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
