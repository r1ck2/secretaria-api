import { Flow } from "@/modules/flow/flow.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { Agent } from "@/modules/agent/agent.entity";
import { AdminAgent } from "@/modules/adminAgent/adminAgent.entity";
import { Setting } from "@/modules/setting/setting.entity";
import { Appointment } from "@/modules/appointment/appointment.entity";
import { FlowSession } from "./flowSession.entity";
import { WhatsappConnection } from "@/modules/whatsapp/whatsapp.entity";
import { ProfessionalActiveFlow } from "@/modules/professionalFlow/professionalFlow.entity";
import { FlowBlockedCustomer } from "@/modules/flowBlock/flowBlock.entity";
import { CalendarService } from "@/modules/calendar/calendar.service";
import { calendarRepository } from "@/modules/calendar/calendar.repository";
import { KanbanBoard } from "@/modules/kanban/kanban-board.entity";
import { KanbanColumn } from "@/modules/kanban/kanban-column.entity";
import { KanbanCard } from "@/modules/kanban/kanban-card.entity";
import { logService } from "@/modules/log/log.service";
import { normalizePhoneNumber, getPhoneNumberVariations } from "@/utils/phoneNormalizer";
import OpenAI from "openai";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  data: {
    nodeType: string;
    label: string;
    endpoint?: string;
    system_prompt?: string;
    message?: string;
    condition?: string;
    todo_title?: string;
    priority?: string;
  };
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface NodeResult {
  node_id: string;
  node_type: string;
  label: string;
  status: "executed" | "waiting_input" | "completed" | "error";
  output: Record<string, any>;
  session_id: string;
  context: Record<string, any>;
}

type NodeResultInternal = NodeResult & { _nextNodeId?: string };

// ── Engine ────────────────────────────────────────────────────────────────────

export class FlowEngineService {
  private calendarService = new CalendarService();

  // ── Entry point ───────────────────────────────────────────────────────────────

  async receiveMessage(
    phoneNumber: string,
    message: string,
    flowId?: string,
    toNumber?: string,
    professionalUserIdOverride?: string
  ): Promise<NodeResult[]> {

    // Normalize phone number for customer lookup only
    const phoneNormalization = normalizePhoneNumber(phoneNumber);
    const normalizedPhone = phoneNormalization.normalized;
    const fullPhone = phoneNormalization.full; // Keep full phone with country code

    // Log phone normalization
    await logService.logFlowAutomation({
      action: "phone_normalization",
      message: `Phone number normalized for lookup: ${phoneNumber} -> ${normalizedPhone}`,
      phone_number: fullPhone,
      metadata: {
        original_phone: phoneNumber,
        normalized_phone: normalizedPhone,
        full_phone: fullPhone,
        country_code: phoneNormalization.countryCode,
        is_valid: phoneNormalization.isValid,
      },
    });

    // Log message reception
    await logService.logFlowAutomation({
      action: "receive_message",
      message: `Message received from ${fullPhone}`,
      phone_number: fullPhone,
      metadata: {
        messagePreview: message.substring(0, 100),
        flowId,
        toNumber,
        professionalUserIdOverride,
        original_phone: phoneNumber,
      },
    });

    // 1. Find or create session using FULL phone (with country code)
    let session = await this.findActiveSession(fullPhone);

    // ── IMPROVEMENT 1: If session is completed, restart from beginning ──────────
    if (!session) {
      const flow = await this.resolveFlow(flowId, toNumber, professionalUserIdOverride);
      if (!flow) {
        await logService.logFlowAutomation({
          level: "error",
          action: "no_flow_found",
          message: "No active flow found for message processing",
          phone_number: phoneNumber,
          metadata: { flowId, toNumber, professionalUserIdOverride },
        });
        throw new Error("No active flow found. Please create and activate a flow first.");
      }

      // ── IMPROVEMENT 3: Verify phone is a registered customer ─────────────────
      // Try to find customer using phone number variations (normalized search)
      const phoneVariations = getPhoneNumberVariations(phoneNumber);
      const customer = await Customer.findOne({ 
        where: { 
          phone: { [Op.in]: phoneVariations }
        } 
      });

      await logService.logFlowAutomation({
        action: "customer_lookup",
        message: `Customer lookup with phone variations`,
        phone_number: fullPhone,
        metadata: {
          phone_variations: phoneVariations,
          customer_found: !!customer,
          customer_id: customer?.id,
        },
      });

      // Resolve professional's user_id
      let professionalUserId = professionalUserIdOverride || flow.user_id;
      if (toNumber) {
        const conn = await WhatsappConnection.findOne({ where: { phone_number: toNumber, status: "connected" } });
        if (conn?.user_id) {
          professionalUserId = conn.user_id;
        } else {
          const { User } = await import("@/modules/user/user.entity");
          const prof = await User.findOne({ where: { phone: toNumber, status: true } });
          if (prof?.id) professionalUserId = prof.id;
        }
      }

      // If phone is not a registered customer, return a non-customer message
      if (!customer) {
        await logService.logFlowAutomation({
          level: "warn",
          action: "customer_not_found",
          message: `Phone ${fullPhone} not found in customer database`,
          phone_number: fullPhone,
          user_id: professionalUserId,
          flow_id: flow.id,
        });

        return [{
          node_id: "system_not_customer",
          node_type: "system",
          label: "Verificação de Cliente",
          status: "completed",
          session_id: "none",
          context: { phone: fullPhone },
          output: {
            message_sent:
              "Olá! 👋 Não encontramos seu número em nosso cadastro.\n\n" +
              "Para utilizar nossos serviços, entre em contato com o consultório para realizar seu cadastro.\n\n" +
              "Obrigado!",
            not_customer: true,
          },
        }];
      }

      // ── Check if professional blocked this customer from the flow ─────────────
      const normalizedPhoneDigits = normalizedPhone.replace(/\D/g, "");
      const blocked = await FlowBlockedCustomer.findOne({
        where: { user_id: professionalUserId, phone: normalizedPhoneDigits },
      });
      if (blocked) {
        await logService.logFlowAutomation({
          level: "info",
          action: "customer_blocked",
          message: `Customer ${fullPhone} is blocked from flow by professional`,
          phone_number: fullPhone,
          user_id: professionalUserId,
          flow_id: flow.id,
        });

        console.log(`[FlowEngine] Flow blocked for phone=${normalizedPhoneDigits} by professional=${professionalUserId}`);
        return [{
          node_id: "system_flow_blocked",
          node_type: "system",
          label: "Atendimento Humano",
          status: "completed",
          session_id: "none",
          context: { phone: fullPhone },
          output: {
            flow_blocked: true,
            message_sent: null, // silently drop — human is handling this conversation
          },
        }];
      }

      console.log("[FlowEngine] Session created — professional user_id:", professionalUserId, "| flow:", flow.id);

      session = await FlowSession.create({
        flow_id: flow.id,
        customer_id: customer.id,
        phone_number: fullPhone, // Store full phone with country code
        status: "active",
        context_json: JSON.stringify({
          phone: fullPhone, // Use full phone in context
          name: customer.name,
          message,
          user_id: professionalUserId,
          flow_id: flow.id,
          is_customer: true,
          time_of_day: this.getTimeOfDay(),
          is_returning_customer: await this.hasConfirmedAppointments(customer.id, professionalUserId),
          returning_customer_hint: (await this.hasConfirmedAppointments(customer.id, professionalUserId))
            ? "O cliente já esteve no consultório antes — trate-o como paciente conhecido."
            : "É a primeira vez que o cliente entra em contato.",
        }),
        history_json: JSON.stringify([]),
      } as any);

      await logService.logFlowAutomation({
        action: "session_created",
        message: `New session created for customer ${customer.name}`,
        phone_number: fullPhone,
        user_id: professionalUserId,
        flow_id: flow.id,
        session_id: session.id,
        metadata: {
          customer_id: customer.id,
          customer_name: customer.name,
          is_returning_customer: await this.hasConfirmedAppointments(customer.id, professionalUserId),
        },
      });
    } else {
      // ── IMPROVEMENT 1: Session completed → restart with welcome menu ──────────
      if (session.status === "completed") {
        // Mark old session as archived and create fresh one
        await session.update({ status: "completed" });

        const flow = await this.resolveFlow(flowId, toNumber, professionalUserIdOverride);
        if (!flow) throw new Error("No active flow found.");

        const phoneVariations = getPhoneNumberVariations(phoneNumber);
        const customer = await Customer.findOne({ 
          where: { 
            phone: { [Op.in]: phoneVariations }
          } 
        });
        const ctx = session.getContext();

        // ── Check block on session restart ────────────────────────────────────
        const normalizedPhoneDigits = normalizedPhone.replace(/\D/g, "");
        const blocked = await FlowBlockedCustomer.findOne({
          where: { user_id: ctx.user_id, phone: normalizedPhoneDigits },
        });
        if (blocked) {
          await logService.logFlowAutomation({
            level: "info",
            action: "session_restart_blocked",
            message: `Session restart blocked for customer ${fullPhone}`,
            phone_number: fullPhone,
            user_id: ctx.user_id,
            session_id: session.id,
          });

          return [{
            node_id: "system_flow_blocked",
            node_type: "system",
            label: "Atendimento Humano",
            status: "completed",
            session_id: "none",
            context: { phone: fullPhone },
            output: { flow_blocked: true, message_sent: null },
          }];
        }

        session = await FlowSession.create({
          flow_id: flow.id,
          customer_id: customer?.id || null,
          phone_number: fullPhone, // Store full phone with country code
          status: "active",
          context_json: JSON.stringify({
            phone: fullPhone, // Use full phone in context
            name: customer?.name || ctx.name || fullPhone,
            message,
            user_id: ctx.user_id,
            flow_id: flow.id,
            is_customer: true,
          }),
          history_json: JSON.stringify([]),
        } as any);

        await logService.logFlowAutomation({
          action: "session_restarted",
          message: `Session restarted for customer ${fullPhone}`,
          phone_number: fullPhone,
          user_id: ctx.user_id,
          flow_id: flow.id,
          session_id: session.id,
        });
      }
    }

    // 2. Update context with new message
    const ctx = session.getContext();
    ctx.message = message;
    ctx.last_user_message = message;
    session.setContext(ctx);
    session.pushHistory({ role: "user", content: message });

    // 3. Load flow graph
    const flow = await Flow.findByPk(session.flow_id);
    if (!flow?.flow_json) throw new Error("Flow has no nodes defined.");
    const graph: FlowGraph = JSON.parse(flow.flow_json);

    // 4. Determine start node
    let startNodeId: string | undefined;
    if (session.status === "waiting_input" && session.current_node_id) {
      // Check if the current node requested to be re-executed (stateful nodes like confirm_cancellation)
      const currentCtx = session.getContext();
      if (currentCtx._reexecute_node) {
        startNodeId = session.current_node_id; // re-run same node
      } else {
        startNodeId = this.getNextNodeId(graph, session.current_node_id);
      }
    } else {
      const triggerNode = graph.nodes.find(n => n.data.nodeType === "trigger");
      if (!triggerNode) throw new Error("Flow has no Trigger node.");
      startNodeId = this.getNextNodeId(graph, triggerNode.id);
    }

    if (!startNodeId) {
      session.status = "completed";
      await session.save();
      return [];
    }

    // 5. Execute
    session.status = "active";
    const results: NodeResult[] = [];

    // Log flow execution start
    await logService.logFlowAutomation({
      action: "flow_execution_start",
      message: `Starting flow execution from node ${startNodeId}`,
      phone_number: phoneNumber,
      user_id: ctx.user_id,
      flow_id: ctx.flow_id,
      session_id: session.id,
      metadata: {
        start_node_id: startNodeId,
        session_status: session.status,
      },
    });

    await this.executeFromNode(graph, startNodeId, session, results);

    await session.save();

    // Log flow execution completion
    await logService.logFlowAutomation({
      action: "flow_execution_complete",
      message: `Flow execution completed with ${results.length} nodes executed`,
      phone_number: phoneNumber,
      user_id: ctx.user_id,
      flow_id: ctx.flow_id,
      session_id: session.id,
      metadata: {
        nodes_executed: results.length,
        final_session_status: session.status,
        results_summary: results.map(r => ({ 
          node_id: r.node_id, 
          node_type: r.node_type, 
          status: r.status 
        })),
      },
    });

    return results;
  }

  // ── Graph traversal ───────────────────────────────────────────────────────────

  private async executeFromNode(
    graph: FlowGraph,
    nodeId: string,
    session: FlowSession,
    results: NodeResult[]
  ): Promise<void> {
    // Resolve conditional branch
    if (nodeId.startsWith("__cond__|")) {
      const [, branch, sourceId] = nodeId.split("|");
      const edge = graph.edges.find(e => e.source === sourceId && e.sourceHandle === branch);
      if (!edge) { session.status = "completed"; return; }
      nodeId = edge.target;
    }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;

    session.current_node_id = nodeId;
    const ctx = session.getContext();

    const result = await this.executeNode(node, ctx, session, graph);
    session.setContext({ ...ctx, ...result.output });
    results.push({ ...result, context: session.getContext() });

    if (result.status === "waiting_input") { session.status = "waiting_input"; return; }
    if (result.status === "completed" || result.status === "error") { session.status = "completed"; return; }

    const nextId = result._nextNodeId || this.getNextNodeId(graph, nodeId);
    if (nextId) await this.executeFromNode(graph, nextId, session, results);
    else session.status = "completed";
  }

  // ── Node dispatcher ───────────────────────────────────────────────────────────

  private async executeNode(node: FlowNode, ctx: Record<string, any>, session: FlowSession, graph: FlowGraph): Promise<NodeResultInternal> {
    const base = { node_id: node.id, label: node.data.label, session_id: session.id, context: ctx };
    switch (node.data.nodeType) {
      case "trigger":          return { ...base, node_type: "trigger", status: "executed", output: {} };
      case "ai_agent":         return this.executeAiAgent(node, ctx, session, base);
      case "list_slots":       return this.executeListSlots(node, ctx, base);
      case "book_appointment": return this.executeBookAppointment(node, ctx, base);
      case "cancel_appointment":   return this.executeCancelAppointment(node, ctx, base);
      case "confirm_cancellation": return this.executeConfirmCancellation(node, ctx, base);
      case "send_message":     return this.executeSendMessage(node, ctx, session, base, graph);
      case "create_todo":      return this.executeCreateTodo(node, ctx, base);
      case "conditional":      return this.executeConditional(node, ctx, base);
      default:                 return { ...base, node_type: node.data.nodeType, status: "executed", output: { skipped: true } };
    }
  }

  // ── ai_agent — Real OpenAI Responses API ─────────────────────────────────────

  private async executeAiAgent(node: FlowNode, ctx: Record<string, any>, session: FlowSession, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    const message = ctx.last_user_message || ctx.message || "";

    await logService.logFlowAutomation({
      action: "ai_agent_start",
      message: `AI agent node execution started`,
      phone_number: ctx.phone,
      user_id: userId,
      flow_id: ctx.flow_id,
      session_id: session.id,
      metadata: {
        node_id: node.id,
        node_label: node.data.label,
        message_preview: message.substring(0, 100),
      },
    });

    // ── Resolve which agent to use ────────────────────────────────────────────
    // Priority: use_admin_agent GLOBAL setting (is_admin=true) → admin agent linked to flow
    //           otherwise → professional's own agent
    let resolvedAgent: { openai_api_key: string; model: string; system_prompt: string; temperature: number; top_p?: number; max_output_tokens?: number; store: boolean; truncation: string } | null = null;

    const globalAdminSetting = await Setting.findOne({
      where: { is_admin: true, key: "use_admin_agent" },
    });
    const useAdminAgent = globalAdminSetting?.value === "true";

    if (useAdminAgent && ctx.flow_id) {
      // Load the flow to get admin_agent_id
      const flow = await Flow.findByPk(ctx.flow_id, { attributes: ["admin_agent_id"] });
      if (flow?.admin_agent_id) {
        const adminAgent = await AdminAgent.findOne({
          where: { id: flow.admin_agent_id, status: true },
        });
        if (adminAgent?.openai_api_key) {
          resolvedAgent = adminAgent;
          console.log(`[FlowEngine] ai_agent(${node.id}) — using admin agent: ${adminAgent.name}`);

          await logService.logFlowAutomation({
            action: "ai_agent_admin_selected",
            message: `Using admin agent: ${adminAgent.name}`,
            phone_number: ctx.phone,
            user_id: userId,
            flow_id: ctx.flow_id,
            session_id: session.id,
            metadata: {
              node_id: node.id,
              admin_agent_id: adminAgent.id,
              admin_agent_name: adminAgent.name,
            },
          });
        }
      }
    }

    if (!resolvedAgent) {
      // Fallback: professional's own agent
      const profAgent = await Agent.findOne({
        where: { user_id: userId, status: true },
        order: [["updated_at", "DESC"]],
      });
      if (profAgent?.openai_api_key) {
        resolvedAgent = profAgent;
        console.log(`[FlowEngine] ai_agent(${node.id}) — using professional agent for user_id=${userId}`);

        await logService.logFlowAutomation({
          action: "ai_agent_professional_selected",
          message: `Using professional agent`,
          phone_number: ctx.phone,
          user_id: userId,
          flow_id: ctx.flow_id,
          session_id: session.id,
          metadata: {
            node_id: node.id,
            agent_id: profAgent.id,
          },
        });
      }
    }

    if (!resolvedAgent) {
      await logService.logFlowAutomation({
        level: "warn",
        action: "ai_agent_fallback_mock",
        message: `No OpenAI agent available, falling back to mock`,
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        session_id: session.id,
        metadata: { node_id: node.id },
      });

      console.warn(`[FlowEngine] ai_agent(${node.id}) — no agent/key available for user_id=${userId}, falling back to mock.`);
      return this.executeAiAgentMock(node, ctx, session, base);
    }

    const agent = resolvedAgent;
    console.log(`[FlowEngine] ai_agent(${node.id}) — calling OpenAI model=${agent.model}`);

    try {
      const openai = new OpenAI({ apiKey: agent.openai_api_key });

      // Build conversation input from history
      const history = session.getHistory();
      const inputMessages: OpenAI.Responses.EasyInputMessage[] = history.map((h: any) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      }));

      // Add current message if not already in history
      if (!inputMessages.length || inputMessages[inputMessages.length - 1].content !== message) {
        inputMessages.push({ role: "user", content: message });
      }

      const response = await openai.responses.create({
        model: agent.model || "gpt-4o-mini",
        instructions: this.renderTemplate(node.data.system_prompt || agent.system_prompt || "Você é um assistente de atendimento.", ctx),
        input: inputMessages,
        temperature: agent.temperature ?? 1.0,
        ...(agent.max_output_tokens ? { max_output_tokens: agent.max_output_tokens } : {}),
        ...(agent.top_p ? { top_p: agent.top_p } : {}),
        store: agent.store ?? true,
        truncation: (agent.truncation as any) || "auto",
      });

      const aiText = response.output_text || "";

      await logService.logFlowAutomation({
        action: "ai_agent_openai_success",
        message: `OpenAI response received successfully`,
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        session_id: session.id,
        metadata: {
          node_id: node.id,
          model: agent.model,
          response_id: response.id,
          response_preview: aiText.substring(0, 100),
          input_messages_count: inputMessages.length,
        },
      });

      // Detect intent from AI response text
      // The node's system_prompt may instruct the AI to return a keyword like "agendar" or "duvida"
      // OR the AI may return a full sentence — handle both cases
      const lowerAi = aiText.toLowerCase().trim();
      let intent = ctx.intent || "general";

      if (lowerAi === "agendar" || lowerAi.startsWith("agendar")) {
        intent = "agendar";
      } else if (lowerAi === "duvida" || lowerAi === "dúvida" || lowerAi.startsWith("duvida")) {
        intent = "duvida";
      } else if (lowerAi === "cancelar" || lowerAi.startsWith("cancelar")) {
        intent = "cancelar";
      } else if (lowerAi === "menu" || lowerAi.startsWith("menu")) {
        intent = "menu";
      } else if (lowerAi.includes("agendar") || lowerAi.includes("horário") || lowerAi.includes("consulta") || lowerAi.includes("disponível")) {
        intent = "agendar";
      } else if (lowerAi.includes("cancelar") || lowerAi.includes("desmarcar")) {
        intent = "cancelar";
      } else if (lowerAi.includes("dúvida") || lowerAi.includes("duvida") || lowerAi.includes("encaminhar")) {
        intent = "duvida";
      }
      // If AI returned a full conversational response (not a keyword), keep previous intent or general

      // Handle slot choice: if AI returned a number (1-4), extract chosen_slot
      // If AI returned "menu" or "0", clear chosen_slot so conditional routes back to menu
      // Also handle if AI returned a time string like "9:00" or "14:00" — match against slots
      const slotNum = parseInt(lowerAi.trim(), 10);
      let chosenSlot = ctx.chosen_slot;
      if (lowerAi === "menu" || lowerAi === "0") {
        chosenSlot = null; // signal to go back to menu
        intent = "menu";
      } else if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 4 && ctx.slots) {
        chosenSlot = ctx.slots.find((s: any) => s.index === slotNum) || ctx.slots[slotNum - 1];
      } else if (ctx.slots && Array.isArray(ctx.slots)) {
        // AI returned something other than a clean number (e.g. "9:00", "14h", "segundo horário")
        // Try to match against slot labels or find by time string
        const matched = ctx.slots.find((s: any) => {
          const label: string = (s.label || "").toLowerCase();
          const aiLower = lowerAi.replace(/[^0-9:h]/g, "");
          return label.includes(lowerAi) || label.includes(aiLower) ||
            // match "9:00" against "09:00" or "9h"
            label.replace(/^0/, "").includes(lowerAi.replace(/^0/, ""));
        });
        if (matched) {
          chosenSlot = matched;
        }
        // If still no match but AI expressed a valid intent to schedule, use first slot as fallback
        // only if the user's original message contained a number
        if (!chosenSlot) {
          const userMsg = (ctx.last_user_message || "").trim();
          const userNum = parseInt(userMsg, 10);
          if (!isNaN(userNum) && userNum >= 1 && userNum <= 4 && ctx.slots) {
            chosenSlot = ctx.slots.find((s: any) => s.index === userNum) || ctx.slots[userNum - 1];
          }
        }
      }

      session.pushHistory({ role: "assistant", content: aiText, node_id: node.id });

      console.log(`[FlowEngine] ai_agent(${node.id}) — response: "${aiText.slice(0, 80)}..." intent=${intent}`);

      return {
        ...base,
        node_type: "ai_agent",
        status: "executed",
        output: {
          intent,
          ai_response: aiText,
          openai_response_id: response.id,
          chosen_slot: chosenSlot ?? null,
        },
      };
    } catch (err: any) {
      await logService.logFlowAutomation({
        level: "error",
        action: "ai_agent_openai_error",
        message: `OpenAI API error: ${err.message}`,
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        session_id: session.id,
        error: err,
        metadata: {
          node_id: node.id,
          model: agent.model,
        },
      });

      console.error(`[FlowEngine] ai_agent(${node.id}) — OpenAI error: ${err.message}`);
      // Fallback to mock on error
      return this.executeAiAgentMock(node, ctx, session, base);
    }
  }

  // Fallback mock when OpenAI not available
  private async executeAiAgentMock(node: FlowNode, ctx: Record<string, any>, session: FlowSession, base: any): Promise<NodeResultInternal> {
    const message = (ctx.last_user_message || "").toLowerCase();

    // ── Nó de saudação: retorna saudação padrão em vez de keyword ────────────
    const isWelcomeNode = node.id === "n_ai_welcome" || node.data.label?.toLowerCase().includes("saudação");
    if (isWelcomeNode) {
      const name = ctx.name || "cliente";
      const aiResponse = `Olá, ${name}! 👋 Seja bem-vindo ao consultório. É um prazer ter você aqui!`;
      session.pushHistory({ role: "assistant", content: aiResponse, node_id: node.id });
      return {
        ...base,
        node_type: "ai_agent",
        status: "executed",
        output: { intent: ctx.intent || "general", ai_response: aiResponse, mock: true, chosen_slot: ctx.chosen_slot ?? null },
      };
    }

    // ── Demais nós: classificador de intenção ─────────────────────────────────
    const scheduleWords = ["agendar", "consulta", "horário", "marcar", "sim", "quero", "ok", "certo", "claro", "vamos", "gostaria", "1"];
    const doubtWords = ["dúvida", "duvida", "pergunta", "falar", "equipe", "2"];
    const cancelWords = ["cancelar", "desmarcar", "remarcar", "3"];
    let intent = ctx.intent || "menu";
    let aiResponse = "";

    if (scheduleWords.some(w => message.includes(w)) || intent === "agendar") {
      intent = "agendar";
      aiResponse = "agendar";
    } else if (cancelWords.some(w => message.includes(w))) {
      intent = "cancelar";
      aiResponse = "cancelar";
    } else if (doubtWords.some(w => message.includes(w))) {
      intent = "duvida";
      aiResponse = "duvida";
    } else {
      intent = "menu";
      aiResponse = "menu";
    }

    // Handle slot number
    const slotNum = parseInt(message.trim(), 10);
    let chosenSlot = ctx.chosen_slot;
    if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 4 && ctx.slots) {
      chosenSlot = ctx.slots.find((s: any) => s.index === slotNum) || ctx.slots[slotNum - 1];
    }

    session.pushHistory({ role: "assistant", content: aiResponse, node_id: node.id });
    return {
      ...base,
      node_type: "ai_agent",
      status: "executed",
      output: { intent, ai_response: aiResponse, mock: true, chosen_slot: chosenSlot ?? null },
    };
  }

  // ── list_slots — Real Google Calendar ─────────────────────────────────────────

  private async executeListSlots(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    console.log("[FlowEngine] list_slots — user_id:", userId);

    // Read appointment duration from professional settings
    const durationMinutes = await this.getAppointmentDurationMinutes(userId);

    try {
      const creds = await calendarRepository.findByUserId(userId);
      if (!creds?.access_token) throw new Error("Calendar not connected");

      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const events = await this.calendarService.listEvents(userId, now.toISOString(), weekEnd.toISOString());

      const busyTimes = events.map((e: any) => ({
        start: new Date(e.start?.dateTime || e.start?.date),
        end: new Date(e.end?.dateTime || e.end?.date),
      }));

      const slots: any[] = [];
      let idx = 1;
      for (let d = 0; d < 7 && slots.length < 4; d++) {
        const day = new Date(now);
        day.setDate(day.getDate() + d + 1);
        for (let h = 8; h < 18 && slots.length < 4; h++) {
          for (let m = 0; m < 60 && slots.length < 4; m += durationMinutes) {
            const slotStart = new Date(day);
            slotStart.setHours(h, m, 0, 0);
            const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

            if (slotEnd.getHours() > 18) break;

            const isBusy = busyTimes.some(b => slotStart < b.end && slotEnd > b.start);
            if (!isBusy) {
              slots.push({
                index: idx++,
                label: `${slotStart.toLocaleDateString("pt-BR")} às ${slotStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
                start: slotStart.toISOString(),
                end: slotEnd.toISOString(),
                duration_minutes: durationMinutes,
              });
            }
          }
        }
      }

      return { ...base, node_type: "list_slots", status: "executed", output: { slots, source: "google_calendar", duration_minutes: durationMinutes } };
    } catch (err: any) {
      console.warn("[FlowEngine] Calendar not available, using mock slots:", err.message);
      const now = new Date();
      const slots = Array.from({ length: 4 }, (_, i) => {
        const start = new Date(now);
        start.setDate(start.getDate() + i + 1);
        start.setHours(9 + (i % 3) * 2, 0, 0, 0);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        return {
          index: i + 1,
          label: `${start.toLocaleDateString("pt-BR")} às ${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          start: start.toISOString(),
          end: end.toISOString(),
          duration_minutes: durationMinutes,
        };
      });
      return { ...base, node_type: "list_slots", status: "executed", output: { slots, source: "mock", duration_minutes: durationMinutes } };
    }
  }

  // ── book_appointment — Real Google Calendar ───────────────────────────────────

  private async executeBookAppointment(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    const chosenSlot = ctx.chosen_slot || ctx.slots?.[0];

    await logService.logFlowAutomation({
      action: "book_appointment_start",
      message: `Booking appointment for customer`,
      phone_number: ctx.phone,
      user_id: userId,
      flow_id: ctx.flow_id,
      metadata: {
        node_id: node.id,
        chosen_slot,
        customer_name: ctx.name,
      },
    });

    console.log("[FlowEngine] book_appointment — user_id:", userId, "| chosen_slot:", JSON.stringify(chosenSlot));

    if (!userId) {
      await logService.logFlowAutomation({
        level: "error",
        action: "book_appointment_no_user",
        message: "No user_id found in context for appointment booking",
        phone_number: ctx.phone,
        flow_id: ctx.flow_id,
        metadata: { node_id: node.id },
      });

      return { ...base, node_type: "book_appointment", status: "error", output: { error: "user_id not found in context." } };
    }
    if (!chosenSlot) {
      await logService.logFlowAutomation({
        level: "error",
        action: "book_appointment_no_slot",
        message: "No slot chosen for appointment booking",
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        metadata: { node_id: node.id },
      });

      return { ...base, node_type: "book_appointment", status: "error", output: { error: "No slot chosen in context." } };
    }

    // Read appointment prefix from professional settings
    const prefix = await this.getAppointmentPrefix(userId);
    const eventTitle = `${prefix} — ${ctx.name || ctx.phone}`;

    try {
      const event = await this.calendarService.createEvent(userId, {
        summary: eventTitle,
        description: `Agendamento via AllcanceAgents. Cliente: ${ctx.name || ""} | Tel: ${ctx.phone}`,
        start_date_time: chosenSlot.start,
        end_date_time: chosenSlot.end,
        timezone: "America/Sao_Paulo",
      });

      console.log("[FlowEngine] Calendar event created:", event.id, event.htmlLink);

      // Persist appointment to mv_appointments for future cancellation
      const customer = await Customer.findOne({ where: { phone: ctx.phone } });
      await Appointment.create({
        id: uuidv4(),
        user_id: userId,
        customer_id: customer?.id || null,
        customer_phone: (ctx.phone || "").replace(/\D/g, ""),
        calendar_event_id: event.id!,
        title: eventTitle,
        start_at: new Date(chosenSlot.start),
        end_at: new Date(chosenSlot.end),
        status: "confirmed",
      } as any);

      const appointment = {
        event_id: event.id,
        title: eventTitle,
        start: chosenSlot.start,
        end: chosenSlot.end,
        status: "confirmed",
        html_link: event.htmlLink,
        source: "google_calendar",
      };

      await logService.logFlowAutomation({
        action: "book_appointment_success",
        message: `Appointment booked successfully via Google Calendar`,
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        metadata: {
          node_id: node.id,
          event_id: event.id,
          event_title: eventTitle,
          appointment_start: chosenSlot.start,
          appointment_end: chosenSlot.end,
          customer_id: customer?.id,
          calendar_link: event.htmlLink,
        },
      });

      return { ...base, node_type: "book_appointment", status: "executed", output: { appointment } };
    } catch (err: any) {
      await logService.logFlowAutomation({
        level: "error",
        action: "book_appointment_calendar_error",
        message: `Calendar booking failed: ${err.message}`,
        phone_number: ctx.phone,
        user_id: userId,
        flow_id: ctx.flow_id,
        error: err,
        metadata: {
          node_id: node.id,
          chosen_slot,
          error_details: err?.response?.data || null,
        },
      });

      console.error("[FlowEngine] Calendar booking FAILED:", err.message, err?.response?.data || err?.errors || "");
      return {
        ...base,
        node_type: "book_appointment",
        status: "error",
        output: { error: err.message, details: err?.response?.data || null, source: "google_calendar_error" },
      };
    }
  }

  // ── send_message — Returns message (WhatsApp pending) ─────────────────────────

  private async executeSendMessage(node: FlowNode, ctx: Record<string, any>, session: FlowSession, base: any, graph: FlowGraph): Promise<NodeResultInternal> {
    // Check if previous node set a message_override
    const rendered = ctx.message_override
      ? ctx.message_override
      : this.renderTemplate(node.data.message || "", ctx);

    if (ctx.message_override) {
      const newCtx = { ...ctx };
      delete newCtx.message_override;
      session.setContext(newCtx);
    }

    session.pushHistory({ role: "assistant", content: rendered, node_id: node.id });

    // ── Send via WhatsApp if Evolution API is configured ──────────────────────
    let whatsappSent = false;
    let whatsappProvider = "pending_integration";

    try {
      const { Setting } = await import("@/modules/setting/setting.entity");
      const adminSettings = await Setting.findAll({ where: { is_admin: true } });
      const adminMap = Object.fromEntries(adminSettings.map((s: any) => [s.key, s.value]));
      const provider = adminMap.whatsapp_provider || "apibrasil";
      whatsappProvider = provider;

      if (provider === "evolution" && ctx.user_id && ctx.phone) {
        const { WhatsappConnection } = await import("@/modules/whatsapp/whatsapp.entity");
        const conn = await WhatsappConnection.findOne({ where: { user_id: ctx.user_id } });

        if (conn?.evolution_instance_name && conn?.evolution_instance_apikey) {
          const { evolutionApiService } = await import("@/modules/evolution/evolution.service");
          await evolutionApiService.sendTextMessage(
            conn.evolution_instance_name,
            conn.evolution_instance_apikey,
            ctx.phone,
            rendered
          );
          whatsappSent = true;
        }
      }
    } catch (sendErr: any) {
      console.error("[FlowEngine] executeSendMessage — WhatsApp send failed:", sendErr.message);
    }

    // If this node has no outgoing edges → it's terminal → mark session completed
    const hasNext = graph.edges.some(e => e.source === node.id);
    const status = hasNext ? "waiting_input" : "completed";

    return {
      ...base,
      node_type: "send_message",
      status,
      output: { message_sent: rendered, to: ctx.phone, whatsapp_sent: whatsappSent, whatsapp_provider: whatsappProvider },
    };
  }

  // ── cancel_appointment — Cancel via Google Calendar ──────────────────────────

  private async executeCancelAppointment(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    // Normalize phone — strip all non-digits for consistent matching
    const rawPhone: string = ctx.phone || "";
    const normalizedPhone = rawPhone.replace(/\D/g, "");

    try {
      // Find ONLY confirmed appointments for this customer phone in mv_appointments
      const appointments = await Appointment.findAll({
        where: {
          user_id: userId,
          customer_phone: normalizedPhone,
          status: "confirmed",
        },
        order: [["start_at", "ASC"]],
        limit: 4,
      });

      if (!appointments.length) {
        return {
          ...base,
          node_type: "cancel_appointment",
          // No appointments — mark completed so session restarts on next message
          status: "completed",
          output: {
            appointments: [],
            message_sent:
              `Não encontramos consultas agendadas para o seu número. 😊\n\n` +
              `0️⃣ Voltar ao menu principal`,
          },
        };
      }

      // Format list for the customer to choose
      const list = appointments.map((a, i) => {
        const date = new Date(a.start_at).toLocaleDateString("pt-BR");
        const time = new Date(a.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return {
          index: i + 1,
          id: a.id,
          calendar_event_id: a.calendar_event_id,
          label: `${date} às ${time}`,
          title: a.title,
        };
      });

      // Return waiting_input so engine pauses here — next message goes to confirm_cancellation
      return {
        ...base,
        node_type: "cancel_appointment",
        status: "waiting_input",
        output: {
          appointments: list,
          message_sent:
            `Encontrei as seguintes consultas agendadas:\n\n` +
            list.map(a => `${a.index}. ${a.label}`).join("\n") +
            `\n\n0️⃣ Voltar ao menu\n\nQual consulta deseja cancelar? Responda com o número.`,
        },
      };
    } catch (err: any) {
      console.error("[FlowEngine] cancel_appointment error:", err.message);
      return { ...base, node_type: "cancel_appointment", status: "error", output: { error: err.message } };
    }
  }

  // ── confirm_cancellation — Actually cancel the chosen appointment ─────────────

  private async executeConfirmCancellation(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    const appointments: any[] = ctx.appointments || [];
    const userMsg = (ctx.last_user_message || "").trim().toLowerCase();
    const choiceNum = parseInt(userMsg, 10);

    // ── Step 0: user wants to go back ────────────────────────────────────────
    if (userMsg === "0" || userMsg.includes("voltar") || userMsg.includes("menu")) {
      return {
        ...base,
        node_type: "confirm_cancellation",
        status: "completed",
        output: {
          cancelled: false,
          _reexecute_node: false,
          pending_cancel_appointment: null,
          message_sent: `Tudo bem! Voltando ao menu principal. 😊`,
        },
      };
    }

    // ── Step 2: pending appointment chosen, waiting for yes/no ───────────────
    const pending = ctx.pending_cancel_appointment;
    if (pending) {
      const isYes = userMsg === "1" || userMsg.includes("sim") || userMsg.includes("confirmar");
      const isNo  = userMsg === "2" || userMsg.includes("não") || userMsg.includes("nao");

      if (isNo) {
        return {
          ...base,
          node_type: "confirm_cancellation",
          status: "completed",
          output: {
            cancelled: false,
            _reexecute_node: false,
            pending_cancel_appointment: null,
            message_sent:
              `Tudo bem! O cancelamento foi descartado. 😊\n\n` +
              `Sua consulta de ${pending.label} está mantida.\n\n` +
              `0️⃣ Voltar ao menu principal`,
          },
        };
      }

      if (isYes) {
        try {
          await this.calendarService.cancelEvent(userId, pending.calendar_event_id);
          await Appointment.update({ status: "cancelled" }, { where: { id: pending.id } });

          return {
            ...base,
            node_type: "confirm_cancellation",
            status: "completed",
            output: {
              cancelled: true,
              _reexecute_node: false,
              pending_cancel_appointment: null,
              message_sent:
                `✅ Consulta cancelada com sucesso!\n\n` +
                `📅 ${pending.label}\n\n` +
                `Se precisar reagendar, é só nos chamar.\n\n` +
                `0️⃣ Voltar ao menu principal`,
            },
          };
        } catch (err: any) {
          console.error("[FlowEngine] confirm_cancellation error:", err.message);
          return {
            ...base,
            node_type: "confirm_cancellation",
            status: "completed",
            output: {
              error: err.message,
              _reexecute_node: false,
              pending_cancel_appointment: null,
              message_sent: `Erro ao cancelar. Por favor, entre em contato diretamente com o consultório.`,
            },
          };
        }
      }

      // Unclear answer — ask again, re-execute same node
      return {
        ...base,
        node_type: "confirm_cancellation",
        status: "waiting_input",
        output: {
          cancelled: false,
          _reexecute_node: true,
          pending_cancel_appointment: pending,
          message_sent:
            `Não entendi. Por favor, confirme:\n\n` +
            `1️⃣ Sim — cancelar a consulta de ${pending.label}\n` +
            `2️⃣ Não — manter a consulta\n` +
            `0️⃣ Voltar ao menu`,
        },
      };
    }

    // ── Step 1: user chose which appointment to cancel ────────────────────────
    const chosen = appointments.find((a: any) => a.index === choiceNum);
    if (!chosen) {
      // Invalid choice — re-execute cancel_appointment node (go back one step)
      return {
        ...base,
        node_type: "confirm_cancellation",
        status: "waiting_input",
        output: {
          cancelled: false,
          _reexecute_node: true,
          message_sent: `Opção inválida. Por favor, responda com um número da lista ou 0 para voltar.`,
        },
      };
    }

    // Ask for confirmation — re-execute this node next time (step 2)
    return {
      ...base,
      node_type: "confirm_cancellation",
      status: "waiting_input",
      output: {
        cancelled: false,
        _reexecute_node: true,
        pending_cancel_appointment: chosen,
        message_sent:
          `Você deseja cancelar a seguinte consulta?\n\n` +
          `📅 ${chosen.label}\n\n` +
          `1️⃣ Sim — cancelar\n` +
          `2️⃣ Não — manter\n` +
          `0️⃣ Voltar ao menu`,
      },
    };
  }

  // ── create_todo — Real Kanban card ───────────────────────────────────────────

  private async executeCreateTodo(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const userId: string = ctx.user_id;
    const title = this.renderTemplate(node.data.todo_title || "Retorno para cliente: {{name}}", ctx);
    const priority = node.data.priority || "high";

    try {
      // Find the most recent active kanban board for this professional
      const board = await KanbanBoard.findOne({
        where: { user_id: userId, status: true },
        order: [["updated_at", "DESC"]],
      });

      if (!board) {
        // No board — return simple todo object
        return {
          ...base,
          node_type: "create_todo",
          status: "executed",
          output: { todo: { title, priority, status: "pending", source: "no_board" } },
        };
      }

      // Check if there's already an open card for this phone number
      const existingCard = await KanbanCard.findOne({
        where: {
          board_id: board.id,
          user_id: userId,
          tags: { [Op.like]: `%${ctx.phone}%` },
        },
      });

      if (existingCard) {
        // Card already exists — tell customer to wait
        return {
          ...base,
          node_type: "create_todo",
          status: "executed",
          output: {
            todo: { id: existingCard.id, title: existingCard.title, status: "already_exists" },
            already_pending: true,
            message_override:
              `Olá ${ctx.name}! 😊 Já temos um atendimento em aberto para você.\n\n` +
              `Nossa equipe entrará em contato em breve. Obrigado pela paciência! 🙏`,
          },
        };
      }

      // Find the "A Fazer" column (position 1) or first column
      const column = await KanbanColumn.findOne({
        where: { board_id: board.id },
        order: [["position", "ASC"]],
        offset: 1, // position 1 = "A Fazer"
      }) || await KanbanColumn.findOne({ where: { board_id: board.id }, order: [["position", "ASC"]] });

      if (!column) {
        return {
          ...base,
          node_type: "create_todo",
          status: "executed",
          output: { todo: { title, priority, status: "pending", source: "no_column" } },
        };
      }

      // Count existing cards for position
      const cardCount = await KanbanCard.count({ where: { column_id: column.id } });

      const card = await KanbanCard.create({
        id: uuidv4(),
        board_id: board.id,
        column_id: column.id,
        user_id: userId,
        title,
        description: `Cliente: ${ctx.name} | Telefone: ${ctx.phone}\nMensagem: ${ctx.last_user_message || ""}`,
        priority,
        position: cardCount,
        tags: JSON.stringify([ctx.phone, "whatsapp", "atendimento"]),
      } as any);

      return {
        ...base,
        node_type: "create_todo",
        status: "executed",
        output: {
          todo: { id: card.id, title: card.title, priority, status: "created", board: board.name, column: column.name },
          already_pending: false,
        },
      };
    } catch (err: any) {
      console.error("[FlowEngine] create_todo error:", err.message);
      return {
        ...base,
        node_type: "create_todo",
        status: "executed",
        output: { todo: { title, priority, status: "pending", source: "error", error: err.message } },
      };
    }
  }

  // ── conditional ───────────────────────────────────────────────────────────────

  private async executeConditional(node: FlowNode, ctx: Record<string, any>, base: any): Promise<NodeResultInternal> {
    const condition = node.data.condition || "false";
    let result = false;
    try {
      const fn = new Function(...Object.keys(ctx), `return !!(${condition})`);
      result = fn(...Object.values(ctx));
    } catch { result = false; }

    const branch = result ? "yes" : "no";
    return {
      ...base,
      node_type: "conditional",
      status: "executed",
      output: { condition, result, branch },
      _nextNodeId: `__cond__|${branch}|${node.id}`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private getNextNodeId(graph: FlowGraph, fromNodeId: string): string | undefined {
    const edge = graph.edges.find(e => e.source === fromNodeId && !e.sourceHandle);
    return edge?.target;
  }

  private renderTemplate(template: string, ctx: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (key === "slots" && Array.isArray(ctx.slots)) {
        return ctx.slots.map((s: any) => `${s.index}. ${s.label}`).join("\n");
      }
      if (key === "appointment_date" && ctx.appointment?.start) {
        return new Date(ctx.appointment.start).toLocaleDateString("pt-BR");
      }
      if (key === "appointment_time" && ctx.appointment?.start) {
        return new Date(ctx.appointment.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }
      return ctx[key] ?? `{{${key}}}`;
    });
  }

  // ── Professional settings helpers ────────────────────────────────────────────

  private async getProfessionalSetting(userId: string, key: string, defaultValue: string): Promise<string> {
    const setting = await Setting.findOne({ where: { user_id: userId, key } });
    return setting?.value || defaultValue;
  }

  private async getAppointmentDurationMinutes(userId: string): Promise<number> {
    const val = await this.getProfessionalSetting(userId, "appointment_duration_minutes", "60");
    return parseInt(val, 10) || 60;
  }

  private async getAppointmentPrefix(userId: string): Promise<string> {
    return this.getProfessionalSetting(userId, "appointment_prefix", "Consulta");
  }

  // ── Context enrichment helpers ────────────────────────────────────────────────

  /** Returns "bom dia", "boa tarde" or "boa noite" based on current Brazil time */
  private getTimeOfDay(): string {
    const hour = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
    const h = parseInt(hour, 10);
    if (h >= 5 && h < 12) return "bom dia";
    if (h >= 12 && h < 18) return "boa tarde";
    return "boa noite";
  }

  /** Returns true if customer has any past confirmed appointment with this professional */
  private async hasConfirmedAppointments(customerId: string, userId: string): Promise<boolean> {
    const count = await Appointment.count({
      where: { user_id: userId, customer_id: customerId },
    });
    return count > 0;
  }

  private async findActiveSession(phoneNumber: string): Promise<FlowSession | null> {
    return FlowSession.findOne({
      where: {
        phone_number: phoneNumber,
        status: { [Op.in]: ["active", "waiting_input", "completed"] },
      },
      order: [["created_at", "DESC"]],
    });
  }

  private async resolveFlow(flowId?: string, toNumber?: string, userId?: string): Promise<Flow | null> {
    if (flowId) return Flow.findByPk(flowId);

    // Direct userId override (e.g. from Evolution webhook when phone_number not yet saved)
    const directUserId = userId ?? null;

    if (toNumber || directUserId) {
      let professionalUserId: string | null = directUserId;

      if (!professionalUserId && toNumber) {
        const conn = await WhatsappConnection.findOne({
          where: { phone_number: toNumber, status: "connected" },
        });

        professionalUserId = conn?.user_id ?? await (async () => {
          const { User } = await import("@/modules/user/user.entity");
          const prof = await User.findOne({ where: { phone: toNumber, status: true } });
          return prof?.id ?? null;
        })();
      }

      if (professionalUserId) {
        // 3. Prefer the professional's explicitly chosen active flow
        const activeFlowRecord = await ProfessionalActiveFlow.findOne({
          where: { user_id: professionalUserId },
        });
        if (activeFlowRecord?.flow_id) {
          const activeFlow = await Flow.findOne({
            where: { id: activeFlowRecord.flow_id, status: true },
          });
          if (activeFlow) {
            console.log(`[FlowEngine] resolveFlow — using professional's active flow: ${activeFlow.id} (${activeFlow.name})`);
            return activeFlow;
          }
        }

        // 4. Fallback: most recently updated active flow for this professional
        const flow = await Flow.findOne({
          where: { user_id: professionalUserId, status: true },
          order: [["updated_at", "DESC"]],
        });
        if (flow) return flow;
      }
    }

    // 5. Last resort — any active flow on the platform
    return Flow.findOne({ where: { status: true }, order: [["updated_at", "DESC"]] });
  }
}
