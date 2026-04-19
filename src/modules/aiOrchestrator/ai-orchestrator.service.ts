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

export interface ReceiveMessageParams {
  phoneNumber: string;
  message: string;
  flowId?: string;
  toNumber: string;
  professionalUserId: string;
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
    const { phoneNumber, message, flowId, toNumber, professionalUserId } = params;
    const normalizedPhone = normalizePhone(phoneNumber);

    this.log(LogAction.MESSAGE_RECEIVED, 'Message received', {
      phone_number: normalizedPhone,
      flow_id: flowId,
      user_id: professionalUserId,
      message_length: message.length,
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

    // 4. Enrich context
    const context = await this.deps.sessionManager.enrichContext(session);

    // 5. Select agent (admin or professional)
    const agent = await this.selectAgent(flowId, professionalUserId);
    if (!agent) {
      this.logError(LogAction.AGENT_SELECTED, new Error('No agent configured'), {
        flow_id: flowId,
        user_id: professionalUserId,
      });
      return {
        session_id: session.id,
        messages_sent: [],
        tools_executed: [],
        status: 'error',
      };
    }

    // 6. Build OpenAI client from agent config
    const openAIClient = this.deps.openAIClient ?? new OpenAIClient(agent.openai_api_key!);

    // 7. Serialize context for system prompt
    const history = session.getHistory() as HistoryEntry[];
    const contextString = serializeForOpenAI(context, history);
    const systemPrompt = this.buildSystemPrompt(agent.system_prompt, contextString);

    // 8. Build input messages (history without tool entries)
    const inputMessages = history
      .filter(h => h.role === 'user' || h.role === 'assistant')
      .map(h => ({ role: h.role as 'user' | 'assistant', content: h.content }));

    // 9. Call OpenAI
    this.log(LogAction.OPENAI_REQUEST, 'Calling OpenAI', {
      session_id: session.id,
      model: agent.model,
      history_length: inputMessages.length,
    });

    const toolDefinitions = this.deps.toolExecutor.getToolDefinitions();

    let rawResponse;
    try {
      rawResponse = await openAIClient.createResponse({
        instructions: systemPrompt,
        input: inputMessages,
        tools: toolDefinitions,
        model: agent.model,
        temperature: agent.temperature,
        max_output_tokens: agent.max_output_tokens ?? undefined,
        top_p: agent.top_p ?? undefined,
      });
    } catch (err) {
      this.logError(LogAction.OPENAI_ERROR, err as Error, { session_id: session.id });
      const fallbackMsg = 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em instantes.';
      await this.sendWhatsApp(professionalUserId, normalizedPhone, fallbackMsg);
      return {
        session_id: session.id,
        messages_sent: [fallbackMsg],
        tools_executed: [],
        status: 'error',
      };
    }

    const parsed = openAIClient.parseResponse(rawResponse);

    this.log(LogAction.OPENAI_RESPONSE, 'OpenAI response received', {
      session_id: session.id,
      response_id: parsed.response_id,
      has_tool_calls: parsed.tool_calls.length > 0,
      output_preview: parsed.output_text?.slice(0, 100),
    });

    // 10. Execute tool calls if any
    const toolSummaries: ToolExecutionSummary[] = [];
    if (parsed.tool_calls.length > 0) {
      await this.processToolCalls(parsed.tool_calls, context, session.id, toolSummaries);
      // Re-enrich context after tool execution
      await this.deps.sessionManager.updateContext(session.id, context);
    }

    // 11. Send AI text response via WhatsApp
    const messagesSent: string[] = [];
    if (parsed.output_text) {
      await this.sendWhatsApp(professionalUserId, normalizedPhone, parsed.output_text);
      messagesSent.push(parsed.output_text);

      // Push assistant message to history
      await this.deps.sessionManager.pushMessage(session.id, {
        role: 'assistant',
        content: parsed.output_text,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      session_id: session.id,
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
    return `${agentPrompt}\n\n---\n\n${contextString}`;
  }

  private async processToolCalls(
    toolCalls: ToolCall[],
    context: Record<string, any>,
    sessionId: string,
    summaries: ToolExecutionSummary[]
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const startTime = Date.now();

      this.log(LogAction.TOOL_EXECUTION_START, `Executing tool: ${toolName}`, {
        session_id: sessionId,
        tool_call_id: toolCall.id,
      });

      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await this.deps.toolExecutor.executeTool(toolName, args, context);

        const elapsed = Date.now() - startTime;
        summaries.push({ tool_name: toolName, status: 'success', execution_time_ms: elapsed });

        this.log(LogAction.TOOL_EXECUTION_COMPLETE, `Tool completed: ${toolName}`, {
          session_id: sessionId,
          tool_call_id: toolCall.id,
          execution_time_ms: elapsed,
          success: result.success,
        });

        // Merge tool result data back into context
        if (result.success && result.data) {
          Object.assign(context, result.data);
        }
      } catch (err) {
        const elapsed = Date.now() - startTime;
        summaries.push({
          tool_name: toolName,
          status: 'error',
          execution_time_ms: elapsed,
          error: (err as Error).message,
        });
        this.logError(LogAction.TOOL_ERROR, err as Error, {
          session_id: sessionId,
          tool_name: toolName,
        });
      }
    }
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
    }).catch(() => {/* non-blocking */});
  }
}
