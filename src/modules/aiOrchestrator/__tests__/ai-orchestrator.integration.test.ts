import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../ai-orchestrator.service';
import { SessionManager } from '../session-manager';
import { ToolExecutor } from '../tools/tool-executor';

// ── Mock all DB entities ──────────────────────────────────────────────────────
vi.mock('../../flowEngine/flowSession.entity');
vi.mock('../../customer/customer.entity');
vi.mock('../../flowBlock/flowBlock.entity');
vi.mock('../../agent/agent.entity');
vi.mock('../../adminAgent/adminAgent.entity');
vi.mock('../../flow/flow.entity');
vi.mock('../../setting/setting.entity');
vi.mock('../../whatsapp/whatsapp.entity');

import { FlowSession } from '../../flowEngine/flowSession.entity';
import { Customer } from '../../customer/customer.entity';
import { FlowBlockedCustomer } from '../../flowBlock/flowBlock.entity';
import { Agent } from '../../agent/agent.entity';
import { Setting } from '../../setting/setting.entity';
import { WhatsappConnection } from '../../whatsapp/whatsapp.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, any> = {}) {
  const ctx: Record<string, any> = {
    phone: '5511999999999',
    user_id: 'user-1',
    flow_id: 'flow-1',
    time_of_day: 'bom dia',
    is_returning_customer: false,
    last_user_message: '',
    ...overrides.ctx,
  };
  return {
    id: 'session-1',
    phone_number: '5511999999999',
    flow_id: 'flow-1',
    customer_id: null,
    status: 'active',
    getContext: vi.fn().mockReturnValue(ctx),
    setContext: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    pushHistory: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOrchestrator(openAIResponse: { output_text: string | null; tool_calls: any[] }) {
  const mockLogService = { create: vi.fn().mockResolvedValue(undefined) };
  const mockEvolution = { sendTextMessage: vi.fn().mockResolvedValue(undefined) };

  const mockOpenAIClient = {
    createResponse: vi.fn().mockResolvedValue({
      id: 'resp-1',
      output_text: openAIResponse.output_text,
      tool_calls: openAIResponse.tool_calls,
    }),
    parseResponse: vi.fn().mockReturnValue({
      output_text: openAIResponse.output_text,
      tool_calls: openAIResponse.tool_calls,
      response_id: 'resp-1',
    }),
  };

  const mockToolExecutor = {
    executeTool: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getToolDefinitions: vi.fn().mockReturnValue([]),
  };

  const sessionManager = new SessionManager({ logService: mockLogService });
  const toolExecutor = mockToolExecutor as unknown as ToolExecutor;

  const orchestrator = new AIOrchestrator({
    sessionManager,
    openAIClient: mockOpenAIClient as any,
    toolExecutor,
    evolutionApiService: mockEvolution as any,
    logService: mockLogService as any,
  });

  return { orchestrator, mockOpenAIClient, mockToolExecutor, mockEvolution, mockLogService };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Feature: ai-scheduling-refactoring - AI Orchestrator Integration Tests', () => {
  const baseParams = {
    phoneNumber: '+55 (11) 99999-9999',
    message: 'Olá, quero agendar uma consulta',
    flowId: 'flow-1',
    toNumber: '5511999999999',
    professionalUserId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  // ── 12.1: Full scheduling flow ──────────────────────────────────────────────
  describe('Integration Test 12.1: Agendamento completo', () => {
    test('should complete full scheduling flow: list_slots → book_appointment → confirmation', async () => {
      const session = makeSession();

      // Setup mocks
      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({
        id: 'agent-1',
        openai_api_key: 'sk-test',
        model: 'gpt-4o-mini',
        system_prompt: 'Você é um assistente.',
        temperature: 1.0,
        top_p: null,
        max_output_tokens: null,
      } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({
        evolution_instance_name: 'inst-1',
        evolution_instance_apikey: 'key-1',
      } as any);

      const { orchestrator, mockToolExecutor, mockEvolution } = makeOrchestrator({
        output_text: 'Aqui estão os horários disponíveis: 1. 20/01 às 09:00',
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_slots', arguments: '{}' } }],
      });

      // Mock tool executor to return slots
      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        data: {
          slots: [
            { index: 1, label: '20/01/2026 às 09:00', start: '2026-01-20T09:00:00Z', end: '2026-01-20T10:00:00Z', duration_minutes: 60 },
          ],
        },
      });

      const result = await orchestrator.receiveMessage(baseParams);

      // Verify tool was called
      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith('list_slots', {}, expect.any(Object));

      // Verify WhatsApp message was sent
      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        'inst-1', 'key-1', '5511999999999',
        'Aqui estão os horários disponíveis: 1. 20/01 às 09:00'
      );

      // Verify result structure
      expect(result.status).toBe('completed');
      expect(result.messages_sent).toHaveLength(1);
      expect(result.tools_executed).toHaveLength(1);
      expect(result.tools_executed[0].tool_name).toBe('list_slots');
      expect(result.tools_executed[0].status).toBe('success');
    });

    test('should book appointment when slot is chosen', async () => {
      const session = makeSession({
        ctx: {
          phone: '5511999999999',
          user_id: 'user-1',
          flow_id: 'flow-1',
          time_of_day: 'bom dia',
          is_returning_customer: false,
          last_user_message: '1',
          slots: [{ index: 1, label: '20/01/2026 às 09:00', start: '2026-01-20T09:00:00Z', end: '2026-01-20T10:00:00Z', duration_minutes: 60 }],
        },
      });

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator, mockToolExecutor } = makeOrchestrator({
        output_text: 'Consulta agendada com sucesso para 20/01 às 09:00! ✅',
        tool_calls: [{ id: 'call-2', type: 'function', function: { name: 'book_appointment', arguments: '{"slot_index": 1}' } }],
      });

      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        data: { appointment: { event_id: 'evt-1', title: 'Consulta', start: '2026-01-20T09:00:00Z', status: 'confirmed' } },
      });

      const result = await orchestrator.receiveMessage({ ...baseParams, message: '1' });

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith('book_appointment', { slot_index: 1 }, expect.any(Object));
      expect(result.status).toBe('completed');
      expect(result.tools_executed[0].tool_name).toBe('book_appointment');
      expect(result.tools_executed[0].status).toBe('success');
    });
  });

  // ── 12.2: Cancellation flow ─────────────────────────────────────────────────
  describe('Integration Test 12.2: Cancelamento', () => {
    test('should cancel appointment and confirm removal', async () => {
      const session = makeSession({
        ctx: {
          phone: '5511999999999',
          user_id: 'user-1',
          flow_id: 'flow-1',
          time_of_day: 'boa tarde',
          is_returning_customer: true,
          last_user_message: 'quero cancelar',
          appointments: [{ id: 'apt-1', calendar_event_id: 'evt-1', label: '20/01/2026 às 09:00', title: 'Consulta', start: '2026-01-20T09:00:00Z', end: '2026-01-20T10:00:00Z' }],
        },
      });

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator, mockToolExecutor } = makeOrchestrator({
        output_text: 'Sua consulta de 20/01 às 09:00 foi cancelada com sucesso. ✅',
        tool_calls: [{ id: 'call-3', type: 'function', function: { name: 'cancel_appointment', arguments: '{"appointment_id": "apt-1"}' } }],
      });

      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        data: { cancelled: true, appointment_id: 'apt-1' },
      });

      const result = await orchestrator.receiveMessage({ ...baseParams, message: 'quero cancelar' });

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith('cancel_appointment', { appointment_id: 'apt-1' }, expect.any(Object));
      expect(result.status).toBe('completed');
      expect(result.tools_executed[0].tool_name).toBe('cancel_appointment');
      expect(result.tools_executed[0].status).toBe('success');
      expect(result.messages_sent[0]).toContain('cancelada');
    });
  });

  // ── 12.3: New customer registration ────────────────────────────────────────
  describe('Integration Test 12.3: Cadastro de novo cliente', () => {
    test('should register new customer when phone not found', async () => {
      const session = makeSession();

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(null); // no existing session
      vi.mocked(FlowSession.create).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null); // unknown customer
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator, mockToolExecutor } = makeOrchestrator({
        output_text: 'Cadastro realizado com sucesso! Bem-vindo, João! 🎉',
        tool_calls: [{ id: 'call-4', type: 'function', function: { name: 'register_customer', arguments: '{"name": "João Silva", "phone": "5511999999999"}' } }],
      });

      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        data: { customer_id: 'cust-new-1', name: 'João Silva' },
      });

      const result = await orchestrator.receiveMessage({ ...baseParams, message: 'Olá, meu nome é João Silva' });

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith(
        'register_customer',
        { name: 'João Silva', phone: '5511999999999' },
        expect.any(Object)
      );
      expect(result.status).toBe('completed');
      expect(result.tools_executed[0].tool_name).toBe('register_customer');
      expect(result.tools_executed[0].status).toBe('success');
    });
  });

  // ── 12.4: Kanban card creation ──────────────────────────────────────────────
  describe('Integration Test 12.4: Criação de cartão Kanban', () => {
    test('should create kanban card when customer needs human attention', async () => {
      const session = makeSession();

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue({ id: 'cust-1', name: 'Maria', phone: '5511999999999' } as any);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator, mockToolExecutor } = makeOrchestrator({
        output_text: 'Entendido! Vou encaminhar sua dúvida para nossa equipe. Em breve entraremos em contato. 😊',
        tool_calls: [{ id: 'call-5', type: 'function', function: { name: 'create_todo', arguments: '{"title": "Dúvida: Maria", "priority": "high"}' } }],
      });

      mockToolExecutor.executeTool.mockResolvedValue({
        success: true,
        data: { card_id: 'card-1', title: 'Dúvida: Maria', status: 'created' },
      });

      const result = await orchestrator.receiveMessage({ ...baseParams, message: 'Tenho uma dúvida sobre o tratamento' });

      expect(mockToolExecutor.executeTool).toHaveBeenCalledWith(
        'create_todo',
        { title: 'Dúvida: Maria', priority: 'high' },
        expect.any(Object)
      );
      expect(result.status).toBe('completed');
      expect(result.tools_executed[0].tool_name).toBe('create_todo');
      expect(result.tools_executed[0].status).toBe('success');
      expect(result.messages_sent[0]).toContain('equipe');
    });
  });

  // ── 12.5: Session history completeness ─────────────────────────────────────
  describe('Integration Test 12.5: Session history completeness', () => {
    test('should accumulate messages in session history in chronological order', async () => {
      const history: any[] = [];
      const session = makeSession();
      session.getHistory = vi.fn().mockImplementation(() => [...history]);
      session.pushHistory = vi.fn().mockImplementation((entry: any) => {
        history.push({ ...entry, timestamp: new Date().toISOString() });
      });

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator } = makeOrchestrator({
        output_text: 'Olá! Como posso ajudar?',
        tool_calls: [],
      });

      // Send first message
      await orchestrator.receiveMessage({ ...baseParams, message: 'Olá' });

      // Verify history has user message + assistant reply
      expect(history.length).toBeGreaterThanOrEqual(2);

      const userMessages = history.filter(h => h.role === 'user');
      const assistantMessages = history.filter(h => h.role === 'assistant');

      expect(userMessages.length).toBeGreaterThanOrEqual(1);
      expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

      // User message should come before assistant message
      const firstUser = history.findIndex(h => h.role === 'user');
      const firstAssistant = history.findIndex(h => h.role === 'assistant');
      expect(firstUser).toBeLessThan(firstAssistant);

      // All entries should have timestamps
      history.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(typeof entry.timestamp).toBe('string');
      });
    });

    test('should maintain separate sessions for different professionals with same phone', async () => {
      const session1 = makeSession({ id: 'session-prof1', ctx: { user_id: 'prof-1', flow_id: 'flow-1', phone: '5511999999999', time_of_day: 'bom dia', is_returning_customer: false, last_user_message: '' } });
      const session2 = makeSession({ id: 'session-prof2', ctx: { user_id: 'prof-2', flow_id: 'flow-2', phone: '5511999999999', time_of_day: 'bom dia', is_returning_customer: false, last_user_message: '' } });

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      vi.mocked(FlowSession.findOne)
        .mockResolvedValueOnce(session1 as any)
        .mockResolvedValueOnce(session2 as any);

      // findByPk is called multiple times per receiveMessage (pushMessage + updateContext)
      // Return the correct session based on call order: session1 calls, then session2 calls
      vi.mocked(FlowSession.findByPk)
        .mockResolvedValueOnce(session1 as any) // pushMessage call 1
        .mockResolvedValueOnce(session1 as any) // updateContext call 1
        .mockResolvedValueOnce(session1 as any) // pushMessage assistant call 1
        .mockResolvedValueOnce(session2 as any) // pushMessage call 2
        .mockResolvedValueOnce(session2 as any) // updateContext call 2
        .mockResolvedValueOnce(session2 as any); // pushMessage assistant call 2

      vi.mocked(Agent.findOne)
        .mockResolvedValueOnce({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any)
        .mockResolvedValueOnce({ id: 'agent-2', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);

      const { orchestrator } = makeOrchestrator({ output_text: 'Olá!', tool_calls: [] });

      const result1 = await orchestrator.receiveMessage({ ...baseParams, professionalUserId: 'prof-1', flowId: 'flow-1' });
      const result2 = await orchestrator.receiveMessage({ ...baseParams, professionalUserId: 'prof-2', flowId: 'flow-2' });

      // Sessions should be isolated — different session IDs
      expect(result1.session_id).toBe('session-prof1');
      expect(result2.session_id).toBe('session-prof2');
      expect(result1.session_id).not.toBe(result2.session_id);
    });
  });

  // ── Blocked customer ────────────────────────────────────────────────────────
  describe('Blocked customer handling', () => {
    test('should silently drop message for blocked customer', async () => {
      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue({ id: 'block-1', phone: '5511999999999', user_id: 'user-1' } as any);

      const { orchestrator, mockEvolution } = makeOrchestrator({ output_text: 'Should not be sent', tool_calls: [] });

      const result = await orchestrator.receiveMessage(baseParams);

      // No WhatsApp message should be sent
      expect(mockEvolution.sendTextMessage).not.toHaveBeenCalled();

      // Result should be completed with no messages
      expect(result.status).toBe('completed');
      expect(result.messages_sent).toHaveLength(0);
      expect(result.session_id).toBe('');
    });
  });

  // ── Phone normalization ─────────────────────────────────────────────────────
  describe('Phone normalization', () => {
    test('should normalize phone number before processing', async () => {
      const session = makeSession();

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator } = makeOrchestrator({ output_text: 'Olá!', tool_calls: [] });

      // Phone with formatting characters
      await orchestrator.receiveMessage({ ...baseParams, phoneNumber: '+55 (11) 99999-9999' });

      // FlowSession.findOne should be called with normalized phone (digits only)
      expect(FlowSession.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            phone_number: '5511999999999',
          }),
        })
      );
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────────
  describe('Error handling', () => {
    test('should send fallback message when OpenAI fails', async () => {
      const session = makeSession();

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const mockLogService = { create: vi.fn().mockResolvedValue(undefined) };
      const mockEvolution = { sendTextMessage: vi.fn().mockResolvedValue(undefined) };

      const failingOpenAIClient = {
        createResponse: vi.fn().mockRejectedValue(new Error('OpenAI API timeout')),
        parseResponse: vi.fn(),
      };

      const mockToolExecutor = {
        executeTool: vi.fn(),
        getToolDefinitions: vi.fn().mockReturnValue([]),
      };

      const sessionManager = new SessionManager({ logService: mockLogService });
      const orchestrator = new AIOrchestrator({
        sessionManager,
        openAIClient: failingOpenAIClient as any,
        toolExecutor: mockToolExecutor as unknown as ToolExecutor,
        evolutionApiService: mockEvolution as any,
        logService: mockLogService as any,
      });

      const result = await orchestrator.receiveMessage(baseParams);

      // Should send a friendly fallback message
      expect(mockEvolution.sendTextMessage).toHaveBeenCalledWith(
        'inst-1', 'key-1', '5511999999999',
        expect.stringContaining('dificuldades técnicas')
      );

      expect(result.status).toBe('error');
    });

    test('should continue after tool execution failure', async () => {
      const session = makeSession();

      vi.mocked(FlowBlockedCustomer.findOne).mockResolvedValue(null);
      vi.mocked(FlowSession.findOne).mockResolvedValue(session as any);
      vi.mocked(FlowSession.findByPk).mockResolvedValue(session as any);
      vi.mocked(Customer.findOne).mockResolvedValue(null);
      vi.mocked(Setting.findOne).mockResolvedValue(null);
      vi.mocked(Agent.findOne).mockResolvedValue({ id: 'agent-1', openai_api_key: 'sk-test', model: 'gpt-4o-mini', system_prompt: '', temperature: 1.0 } as any);
      vi.mocked(WhatsappConnection.findOne).mockResolvedValue({ evolution_instance_name: 'inst-1', evolution_instance_apikey: 'key-1' } as any);

      const { orchestrator, mockToolExecutor, mockEvolution } = makeOrchestrator({
        output_text: 'Desculpe, não consegui verificar os horários agora.',
        tool_calls: [{ id: 'call-err', type: 'function', function: { name: 'list_slots', arguments: '{}' } }],
      });

      // Tool fails
      mockToolExecutor.executeTool.mockRejectedValue(new Error('Calendar service unavailable'));

      const result = await orchestrator.receiveMessage(baseParams);

      // Tool failure should be recorded
      expect(result.tools_executed[0].status).toBe('error');
      expect(result.tools_executed[0].error).toContain('Calendar service unavailable');

      // But the AI text response should still be sent
      expect(mockEvolution.sendTextMessage).toHaveBeenCalled();
      expect(result.status).toBe('completed');
    });
  });
});
