import { SessionManager } from './session-manager';
import { OpenAIClient } from './openai.client';
import { ToolExecutor } from './tools/tool-executor';
import { serializeForOpenAI } from './utils/context-serializer';
import { normalizePhone } from './utils/phone-normalizer';
import {
  OrchestratorResult,
  ToolExecutionSummary,
  HistoryEntry,
  LogAction,
  ToolCall,
} from './types';
import { Agent } from '../agent/agent.entity';
import { AdminAgent } from '../adminAgent/adminAgent.entity';
import { Flow } from '../flow/flow.entity';
import { Setting } from '../setting/setting.entity';
import { FlowBlockedCustomer } from '../flowBlock/flowBlock.entity';
import { EvolutionApiService } from '../evolution/evolution.service';
import { LogService } from '../log/log.service';
import { WhatsappConnection } from '../whatsapp/whatsapp.entity';
import { FlowSession } from '../flowEngine/flowSession.entity';

export interface ReceiveMessageParams {
  phoneNumber: string;
  message: string;
  flowId?: string;
  toNumber: string;
  professionalUserId: string;
  senderName?: string; // Name from WhatsApp API if available
}

export interface AIOrchestratordDependencies {
  sessionManager: SessionManager;
  openAIClient?: OpenAIClient; // optional — built from agent config if not provided
  toolExecutor: ToolExecutor;
  evolutionApiService: EvolutionApiService;
  logService: LogService;
}

export class AIOrchestrator {
  constructor(private deps: AIOrchestratordDependencies) {}

  /**
   * Main entry point — receives a WhatsApp message and orchestrates the AI response.
   */
  async receiveMessage(params: ReceiveMessageParams): Promise<OrchestratorResult> {
    const { phoneNumber, message, flowId, toNumber, professionalUserId, senderName } = params;
    const normalizedPhone = normalizePhone(phoneNumber);

    // ── LOG: Mensagem recebida ──────────────────────────────────────────────
    this.log(LogAction.MESSAGE_RECEIVED, `📨 Mensagem recebida de ${normalizedPhone}: "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"`, {
      phone_number: normalizedPhone,
      user_id: professionalUserId,
      message_preview: message.slice(0, 200),
    });

    // 1. Check if customer is blocked
    const isBlocked = await this.isCustomerBlocked(normalizedPhone, professionalUserId);
    if (isBlocked) {
      this.log(LogAction.CUSTOMER_BLOCKED, 'Customer is blocked, skipping', {
        phone_number: normalizedPhone,
        user_id: professionalUserId,
      });
      return {
        session_id: '',
        messages_sent: [],
        tools_executed: [],
        status: 'completed',
      };
    }

    // 2. Find or create session
    const session = await this.deps.sessionManager.findOrCreateSession({
      phoneNumber: normalizedPhone,
      flowId,
      professionalUserId,
    });

    // 3. Push incoming user message to history
    await this.deps.sessionManager.pushMessage(session.id, {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // 4. Reload session from DB to get updated history (pushMessage saves to DB, not in-memory)
    const freshSession = await FlowSession.findByPk(session.id);
    if (!freshSession) throw new Error(`Session ${session.id} not found after push`);

    // 4b. Enrich context from fresh session
    const context = await this.deps.sessionManager.enrichContext(freshSession);

    // If sender name from WhatsApp is available and customer not yet registered, store it
    if (senderName && !context.name) {
      context.whatsapp_sender_name = senderName as any;
    }

    // Enrich with professional settings (company_name, etc.)
    await this.enrichWithProfessionalSettings(context, professionalUserId);

    // 5. Select agent — prefer professional's selected agent, then admin agent
    const agent = await this.selectAgent(flowId, professionalUserId);
    if (!agent) {
      this.logError(LogAction.AGENT_SELECTED, new Error('No agent configured'), {
        flow_id: flowId,
        user_id: professionalUserId,
      });
      const noAgentMsg = 'Olá! Estou temporariamente indisponível. Por favor, tente novamente em instantes.';
      await this.sendWhatsApp(professionalUserId, normalizedPhone, noAgentMsg);
      return {
        session_id: freshSession.id,
        messages_sent: [noAgentMsg],
        tools_executed: [],
        status: 'error',
      };
    }

    // 6. Build OpenAI client from agent config
    const openAIClient = this.deps.openAIClient ?? new OpenAIClient(agent.openai_api_key!);

    // 7. Read history from fresh session — includes the message just pushed
    const history = freshSession.getHistory() as HistoryEntry[];
    const contextString = serializeForOpenAI(context, history);
    const systemPrompt = this.buildSystemPrompt(agent.system_prompt, contextString);

    // 8. Build input messages from history (user + assistant only, no tool entries)
    const inputMessages = history
      .filter(h => h.role === 'user' || h.role === 'assistant')
      .map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }));

    // 9. Call OpenAI — with full tool-calling loop
    this.log(LogAction.OPENAI_REQUEST, `🤖 Enviando para AI [${agent.model}] — sessão ${freshSession.id} — ${inputMessages.length} msgs no histórico`, {
      session_id: freshSession.id,
      phone_number: normalizedPhone,
      user_id: professionalUserId,
      model: agent.model,
      history_length: inputMessages.length,
    });

    const toolDefinitions = this.deps.toolExecutor.getToolDefinitions();
    const openAIParams = {
      instructions: systemPrompt,
      input: inputMessages,
      tools: toolDefinitions,
      model: agent.model,
      temperature: agent.temperature,
      max_output_tokens: agent.max_output_tokens ?? undefined,
      top_p: agent.top_p ?? undefined,
    };

    const toolSummaries: ToolExecutionSummary[] = [];
    let finalText: string | null = null;

    try {
      // First call
      let rawResponse = await openAIClient.createResponse(openAIParams);
      let parsed = openAIClient.parseResponse(rawResponse);

      this.log(LogAction.OPENAI_RESPONSE, `🤖 AI respondeu (1ª chamada) — finish_reason: ${rawResponse.finish_reason} — tools: ${parsed.tool_calls.length} — texto: "${parsed.output_text?.slice(0, 80) ?? 'nenhum'}"`, {
        session_id: freshSession.id,
        phone_number: normalizedPhone,
        finish_reason: rawResponse.finish_reason,
        has_tool_calls: parsed.tool_calls.length > 0,
        tool_names: parsed.tool_calls.map(t => t.function.name),
        output_preview: parsed.output_text?.slice(0, 200),
      });

      // If the model wants to call tools, execute them and call again
      if (parsed.tool_calls.length > 0) {
        // Execute all tool calls and collect results
        const toolResults: { tool_call_id: string; content: string }[] = [];

        for (const toolCall of parsed.tool_calls) {
          const toolName = toolCall.function.name;
          const startTime = Date.now();

          this.log(LogAction.TOOL_EXECUTION_START, `🔧 Executando tool: ${toolName}`, {
            session_id: freshSession.id,
            phone_number: normalizedPhone,
            tool_call_id: toolCall.id,
            tool_args: toolCall.function.arguments.slice(0, 200),
          });

          let resultContent = '';
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await this.deps.toolExecutor.executeTool(toolName, args, context);
            const elapsed = Date.now() - startTime;

            toolSummaries.push({ tool_name: toolName, status: 'success', execution_time_ms: elapsed });

            this.log(LogAction.TOOL_EXECUTION_COMPLETE, `✅ Tool ${toolName} concluída em ${elapsed}ms`, {
              session_id: freshSession.id,
              phone_number: normalizedPhone,
              tool_name: toolName,
              execution_time_ms: elapsed,
              result_preview: resultContent.slice(0, 200),
            });

            // Merge tool result data back into context
            if (result.success && result.data) {
              Object.assign(context, result.data);
            }

            resultContent = result.success
              ? JSON.stringify(result.data ?? { success: true })
              : JSON.stringify({ error: result.error });
          } catch (err) {
            const elapsed = Date.now() - startTime;
            toolSummaries.push({ tool_name: toolName, status: 'error', execution_time_ms: elapsed, error: (err as Error).message });
            this.logError(LogAction.TOOL_ERROR, err as Error, { session_id: freshSession.id, tool_name: toolName });
            resultContent = JSON.stringify({ error: (err as Error).message });
          }

          toolResults.push({ tool_call_id: toolCall.id, content: resultContent });
        }

        // Update context in session after all tools ran
        await this.deps.sessionManager.updateContext(freshSession.id, context);

        // Second call — rebuild context with updated slots/appointments
        const updatedHistory = freshSession.getHistory() as HistoryEntry[];
        const updatedContextString = serializeForOpenAI(context, updatedHistory);
        const updatedSystemPrompt = this.buildSystemPrompt(agent.system_prompt, updatedContextString);
        const updatedParams = { ...openAIParams, instructions: updatedSystemPrompt };

        const assistantMsg = {
          role: 'assistant' as const,
          content: null as any,
          tool_calls: rawResponse.tool_calls,
        };

        const secondRaw = await openAIClient.createResponseWithToolResults(
          updatedParams,
          assistantMsg,
          toolResults.map(tr => ({ role: 'tool' as const, tool_call_id: tr.tool_call_id, content: tr.content }))
        );
        const secondParsed = openAIClient.parseResponse(secondRaw);

        this.log(LogAction.OPENAI_RESPONSE, `🤖 AI respondeu (2ª chamada, pós-tools) — "${secondParsed.output_text?.slice(0, 100) ?? 'nenhum'}"`, {
          session_id: freshSession.id,
          phone_number: normalizedPhone,
          finish_reason: secondRaw.finish_reason,
          output_preview: secondParsed.output_text?.slice(0, 300),
        });

        finalText = secondParsed.output_text;
      } else {
        finalText = parsed.output_text;
      }
    } catch (err) {
      this.logError(LogAction.OPENAI_ERROR, err as Error, { session_id: freshSession.id });
      const fallbackMsg = 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em instantes.';
      await this.sendWhatsApp(professionalUserId, normalizedPhone, fallbackMsg);
      return {
        session_id: freshSession.id,
        messages_sent: [fallbackMsg],
        tools_executed: toolSummaries,
        status: 'error',
      };
    }

    // 10. Send final response via WhatsApp
    const messagesSent: string[] = [];
    if (finalText) {
      await this.sendWhatsApp(professionalUserId, normalizedPhone, finalText);
      messagesSent.push(finalText);

      this.log(LogAction.MESSAGE_SENT, `📤 Resposta enviada ao cliente ${normalizedPhone}: "${finalText.slice(0, 100)}${finalText.length > 100 ? '...' : ''}"`, {
        session_id: freshSession.id,
        phone_number: normalizedPhone,
        user_id: professionalUserId,
        tools_used: toolSummaries.map(t => t.tool_name),
        response_preview: finalText.slice(0, 300),
      });

      await this.deps.sessionManager.pushMessage(freshSession.id, {
        role: 'assistant',
        content: finalText,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logError(LogAction.OPENAI_ERROR, new Error('AI returned empty response'), {
        session_id: freshSession.id,
        phone_number: normalizedPhone,
        user_id: professionalUserId,
      });
      const retryMsg = 'Desculpe, não consegui processar sua mensagem. Poderia reformular de outra forma?';
      await this.sendWhatsApp(professionalUserId, normalizedPhone, retryMsg);
      messagesSent.push(retryMsg);
      await this.deps.sessionManager.pushMessage(freshSession.id, {
        role: 'assistant',
        content: retryMsg,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      session_id: freshSession.id,
      messages_sent: messagesSent,
      tools_executed: toolSummaries,
      status: 'completed',
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async isCustomerBlocked(phone: string, userId: string): Promise<boolean> {
    try {
      const blocked = await FlowBlockedCustomer.findOne({
        where: { phone, user_id: userId },
      });
      return !!blocked;
    } catch {
      return false;
    }
  }

  private async selectAgent(flowId: string | undefined, userId: string): Promise<Agent | AdminAgent | null> {
    try {
      // Check if professional has a selected agent configured
      const selectedAgentSetting = await Setting.findOne({
        where: { user_id: userId, key: 'selected_agent_id' },
      });

      if (selectedAgentSetting?.value) {
        const selectedAdminAgent = await AdminAgent.findOne({
          where: { id: selectedAgentSetting.value, status: true },
        });
        if (selectedAdminAgent?.openai_api_key) {
          this.log(LogAction.AGENT_SELECTED, 'Using professional-selected admin agent', {
            agent_id: selectedAdminAgent.id,
            user_id: userId,
          });
          return selectedAdminAgent;
        }
      }

      // When AI Orchestrator is active (no flowId), use the first active AdminAgent directly
      if (!flowId) {
        const adminAgent = await AdminAgent.findOne({
          where: { status: true },
          order: [['created_at', 'DESC']],
        });
        if (adminAgent?.openai_api_key) {
          this.log(LogAction.AGENT_SELECTED, 'Using active admin agent (AI Orchestrator mode)', {
            agent_id: adminAgent.id,
          });
          return adminAgent;
        }
      }

      // FlowEngine mode: check use_admin_agent setting
      const adminSetting = await Setting.findOne({
        where: { key: 'use_admin_agent', is_admin: true },
      });
      const useAdminAgent = adminSetting?.value === 'true';

      if (useAdminAgent && flowId) {
        const flow = await Flow.findByPk(flowId);
        if (flow?.admin_agent_id) {
          const adminAgent = await AdminAgent.findByPk(flow.admin_agent_id);
          if (adminAgent?.openai_api_key) {
            this.log(LogAction.AGENT_SELECTED, 'Using admin agent from flow', {
              agent_id: adminAgent.id,
              flow_id: flowId,
            });
            return adminAgent;
          }
        }
      }

      // Fallback: professional's own agent
      const agent = await Agent.findOne({
        where: { user_id: userId, status: true },
        order: [['created_at', 'DESC']],
      });

      if (agent?.openai_api_key) {
        this.log(LogAction.AGENT_SELECTED, 'Using professional agent', {
          agent_id: agent.id,
          user_id: userId,
        });
        return agent;
      }

      return null;
    } catch (err) {
      this.logError(LogAction.AGENT_SELECTED, err as Error, { flow_id: flowId, user_id: userId });
      return null;
    }
  }

  private buildSystemPrompt(agentPrompt: string, contextString: string): string {
    return `${agentPrompt ? agentPrompt + '\n\n---\n\n' : ''}## PROTOCOLO DE ATENDIMENTO VIA WHATSAPP

Você é um assistente de atendimento. Siga este protocolo rigorosamente em TODAS as interações.

### REGRAS ABSOLUTAS
1. SEMPRE responda em português brasileiro
2. SEMPRE termine cada mensagem com uma pergunta ou próxima ação disponível para o cliente
3. NUNCA deixe o cliente sem resposta ou próximo passo
4. NUNCA diga "vou verificar" ou "aguarde" sem já trazer o resultado na mesma mensagem
5. Quando executar uma tool, use o resultado para formular a resposta COMPLETA ao cliente na mesma mensagem

---

### ESTÁGIOS DO ATENDIMENTO

**ESTÁGIO: BOAS-VINDAS** (primeira mensagem da sessão)
- Cumprimente com o horário do dia
- Apresente-se com o nome da empresa (se disponível no contexto)
- Pergunte como pode ajudar
- Exemplo: "Olá! Bom dia! 😊 Aqui é a [EMPRESA]. Como posso te ajudar hoje?"

**ESTÁGIO: IDENTIFICAÇÃO** (cliente não cadastrado)
- Se is_returning_customer = Não e não há customer_id no contexto:
  - Peça o nome completo do cliente
  - Se já tiver o nome (do WhatsApp), confirme: "Seu nome é [NOME], correto?"
  - Após confirmar, chame register_customer com o nome confirmado
  - Continue o atendimento normalmente

**ESTÁGIO: INTENÇÃO** (entender o que o cliente quer)
- Detecte a intenção e aja IMEDIATAMENTE:
  - "agendar", "marcar", "consulta", "horário", "disponível" → chame list_slots e apresente os horários
  - "cancelar", "desmarcar", "cancelamento" → chame cancel_appointment e apresente os agendamentos
  - "agendou?", "confirmou?", "foi agendado?" → verifique o contexto e informe o status atual
  - Número isolado ("1", "2", "3") quando há slots listados → é escolha de slot, vá para CONFIRMAÇÃO
  - Número isolado quando há agendamentos para cancelar → é escolha de cancelamento, confirme e cancele

**ESTÁGIO: LISTAGEM DE HORÁRIOS** (após list_slots)
- Apresente os horários numerados de forma clara
- Pergunte qual o cliente prefere
- Exemplo:
  "Encontrei estes horários disponíveis:
  1️⃣ Segunda, 20/04 às 09:00
  2️⃣ Segunda, 20/04 às 10:00
  3️⃣ Terça, 21/04 às 14:00
  4️⃣ Quarta, 22/04 às 09:00
  Qual horário prefere? Responda com o número. 😊"

**ESTÁGIO: CONFIRMAÇÃO** (cliente escolheu um slot)
- Quando cliente responder com número (1, 2, 3, 4) e há slots disponíveis no contexto:
  - Identifique o slot escolhido pelo índice
  - Apresente um resumo para confirmação ANTES de agendar:
    "Confirmar agendamento:
    📅 [DATA E HORA DO SLOT ESCOLHIDO]
    👤 [NOME DO CLIENTE]
    Confirma? Responda *sim* para confirmar ou *não* para escolher outro horário."

**ESTÁGIO: AGENDAMENTO** (cliente confirmou com "sim")
- Chame book_appointment com o slot_index correto
- Após o agendamento ser criado, informe o resultado COMPLETO:
  "✅ Agendamento confirmado!
  📅 [DATA E HORA]
  👤 [NOME DO CLIENTE]
  Qualquer dúvida, é só chamar! 😊"

**ESTÁGIO: DATA ESPECÍFICA** (cliente pediu data/hora específica)
- Se cliente pedir "dia 20 às 9h" ou similar:
  - Chame list_slots para verificar disponibilidade
  - Se o horário pedido estiver disponível, vá para CONFIRMAÇÃO com esse slot
  - Se não estiver disponível, informe e apresente os horários disponíveis

**ESTÁGIO: PERGUNTA SOBRE STATUS**
- Se cliente perguntar "agendou?", "foi confirmado?", "tem agendamento?":
  - Verifique o contexto: se há [CONSULTAS AGENDADAS] no contexto, informe os agendamentos
  - Se não há agendamentos no contexto, informe que não há agendamentos confirmados
  - Ofereça agendar se não houver

---

### CONTEXTO ATUAL DA CONVERSA
${contextString}`;
  }

  private async enrichWithProfessionalSettings(context: Record<string, any>, userId: string): Promise<void> {
    try {
      const settings = await Setting.findAll({ where: { user_id: userId } });
      const map = Object.fromEntries(settings.map((s: any) => [s.key, s.value]));
      if (map.company_name) context.company_name = map.company_name;
      if (map.appointment_prefix) context.appointment_prefix = map.appointment_prefix;
      if (map.use_google_calendar !== undefined) context.use_google_calendar = map.use_google_calendar !== 'false';
      if (map.service_type) context.service_type = map.service_type;
      if (map.working_days) {
        try { context.working_days = JSON.parse(map.working_days); } catch { /* ignore */ }
      }
      if (map.working_hours_start) context.working_hours_start = map.working_hours_start;
      if (map.working_hours_end) context.working_hours_end = map.working_hours_end;
    } catch { /* non-blocking */ }
  }

  private async sendWhatsApp(userId: string, toPhone: string, text: string): Promise<void> {
    try {
      const conn = await WhatsappConnection.findOne({
        where: { user_id: userId, status: 'connected' },
      });

      if (!conn?.evolution_instance_name || !conn?.evolution_instance_apikey) {
        throw new Error(`No connected WhatsApp instance for user ${userId}`);
      }

      await this.deps.evolutionApiService.sendTextMessage(
        conn.evolution_instance_name,
        conn.evolution_instance_apikey,
        toPhone,
        text
      );

      this.log(LogAction.MESSAGE_SENT, 'WhatsApp message sent', {
        user_id: userId,
        phone_number: toPhone,
        message_length: text.length,
      });
    } catch (err) {
      this.logError(LogAction.WHATSAPP_ERROR, err as Error, {
        user_id: userId,
        phone_number: toPhone,
      });
      throw err;
    }
  }

  private log(action: LogAction, message: string, metadata?: Record<string, any>) {
    this.deps.logService.create({
      level: 'info',
      module: 'ai_orchestrator',
      action,
      message,
      metadata,
      session_id: metadata?.session_id,
      phone_number: metadata?.phone_number,
      user_id: metadata?.user_id,
    }).catch(() => {/* non-blocking */});
  }

  private logError(action: LogAction, error: Error, metadata?: Record<string, any>) {
    this.deps.logService.create({
      level: 'error',
      module: 'ai_orchestrator',
      action,
      message: error.message,
      metadata,
      error_stack: error.stack,
      session_id: metadata?.session_id,
      phone_number: metadata?.phone_number,
      user_id: metadata?.user_id,
    }).catch(() => {/* non-blocking */});
  }
}
