import { describe, test, expect, beforeEach, vi } from 'vitest';
import { fc } from 'fast-check';
import { FlowEngineService } from './flowEngine.service';
import { FlowSession } from './flowSession.entity';

// Mock dependencies
vi.mock('@/modules/log/log.service');
vi.mock('@/modules/calendar/calendar.repository');
vi.mock('@/modules/calendar/calendar.service');

describe('Bug Condition Exploration - Node Validation Inadequate', () => {
  let flowEngineService: FlowEngineService;
  let mockSession: FlowSession;

  beforeEach(() => {
    vi.clearAllMocks();
    flowEngineService = new FlowEngineService();
    
    // Mock session
    mockSession = {
      id: 'session-123',
      pushHistory: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
      context: {}
    } as any;
  });

  /**
   * **Validates: Requirements 2.3**
   * 
   * Bug Condition Exploration Test - Node Validation Mock Responses
   * 
   * This test SHOULD FAIL on unfixed code to confirm the bug exists.
   * The test verifies that AI agent nodes process real messages and return
   * concrete menu options or complete the session, instead of returning
   * mock responses like "agendar", "cancelar", "duvida", "menu".
   * 
   * Expected behavior on UNFIXED code: Test FAILS (nodes return mock keywords)
   * Expected behavior on FIXED code: Test PASSES (nodes return concrete responses)
   */
  test('should process real messages and return concrete responses instead of mock keywords', async () => {
    // Arrange: Create a realistic AI agent node that should process messages properly
    const aiAgentNode = {
      id: 'n_ai_classifier',
      type: 'ai_agent',
      data: {
        label: 'Classificador de Intenção',
        system_prompt: 'Você é um assistente que ajuda clientes a navegar pelo sistema de agendamento. Responda de forma natural e útil.',
        model: 'gpt-3.5-turbo'
      }
    };

    // Test context with real user messages that should get proper responses
    const testCases = [
      {
        message: 'Olá, gostaria de agendar uma consulta para amanhã de manhã',
        expectedNotToBe: 'agendar', // Should not return just the keyword
        description: 'scheduling request'
      },
      {
        message: 'Tenho uma dúvida sobre o procedimento, podem me explicar?',
        expectedNotToBe: 'duvida', // Should not return just the keyword
        description: 'question about procedure'
      },
      {
        message: 'Preciso cancelar minha consulta de quinta-feira',
        expectedNotToBe: 'cancelar', // Should not return just the keyword
        description: 'cancellation request'
      },
      {
        message: 'Não entendi as opções, pode mostrar o menu novamente?',
        expectedNotToBe: 'menu', // Should not return just the keyword
        description: 'menu request'
      }
    ];

    for (const testCase of testCases) {
      // Arrange: Context with real user message
      const context = {
        phone: '5511999999999',
        name: 'João Silva',
        last_user_message: testCase.message,
        user_id: 'user-123',
        flow_id: 'flow-456',
        intent: 'general'
      };

      const baseResult = {
        node_id: aiAgentNode.id,
        label: aiAgentNode.data.label,
        session_id: mockSession.id,
        context
      };

      // Act: Execute the AI agent node (this will likely use the mock implementation)
      const result = await (flowEngineService as any).executeAiAgent(
        aiAgentNode,
        context,
        mockSession,
        baseResult
      );

      // Assert: The response should NOT be a simple mock keyword
      // This assertion SHOULD FAIL on unfixed code (proving the bug exists)
      expect(result.output.ai_response).not.toBe(testCase.expectedNotToBe);
      
      // The response should be more substantial than just a keyword
      expect(result.output.ai_response.length).toBeGreaterThan(10);
      
      // Should not have the mock flag set to true
      expect(result.output.mock).not.toBe(true);
      
      console.log(`Test case: ${testCase.description}`);
      console.log(`Input: "${testCase.message}"`);
      console.log(`Output: "${result.output.ai_response}"`);
      console.log(`Mock flag: ${result.output.mock}`);
      console.log('---');
    }
  });

  /**
   * Property-based test to verify AI nodes don't return mock responses
   * across a wide range of user inputs
   */
  test('should not return mock keywords for any realistic user message', () => {
    fc.assert(
      fc.property(
        // Generate realistic user messages
        fc.oneof(
          fc.constantFrom(
            'Quero agendar uma consulta',
            'Gostaria de marcar um horário',
            'Tenho uma dúvida sobre o tratamento',
            'Preciso de informações',
            'Quero cancelar minha consulta',
            'Preciso remarcar',
            'Não entendi, pode repetir?',
            'Qual é o menu de opções?',
            'Como funciona o agendamento?',
            'Quanto custa a consulta?'
          ),
          fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0)
        ),
        fc.constantFrom('João', 'Maria', 'Pedro', 'Ana', 'Carlos'),
        async (userMessage, userName) => {
          // Arrange
          const aiAgentNode = {
            id: 'n_ai_test',
            type: 'ai_agent',
            data: {
              label: 'Test AI Node',
              system_prompt: 'Responda de forma natural e útil ao cliente.',
              model: 'gpt-3.5-turbo'
            }
          };

          const context = {
            phone: '5511999999999',
            name: userName,
            last_user_message: userMessage,
            user_id: 'user-123',
            flow_id: 'flow-456',
            intent: 'general'
          };

          const baseResult = {
            node_id: aiAgentNode.id,
            label: aiAgentNode.data.label,
            session_id: mockSession.id,
            context
          };

          // Act
          const result = await (flowEngineService as any).executeAiAgent(
            aiAgentNode,
            context,
            mockSession,
            baseResult
          );

          // Assert: Should not return simple mock keywords
          const mockKeywords = ['agendar', 'cancelar', 'duvida', 'menu'];
          const response = result.output.ai_response.toLowerCase().trim();
          
          // This property SHOULD FAIL on unfixed code
          expect(mockKeywords).not.toContain(response);
          
          // Response should be more than just a keyword
          expect(response.length).toBeGreaterThan(5);
        }
      ),
      { numRuns: 20 } // Run 20 test cases
    );
  });

  /**
   * Test that verifies nodes should return concrete menu options
   * when appropriate, not just keywords
   */
  test('should return concrete menu options when user requests menu', async () => {
    // Arrange: Node that should provide menu options
    const menuNode = {
      id: 'n_ai_menu_provider',
      type: 'ai_agent',
      data: {
        label: 'Menu Provider',
        system_prompt: 'Quando o usuário pedir o menu, forneça opções claras e numeradas para agendamento, dúvidas e cancelamento.',
        model: 'gpt-3.5-turbo'
      }
    };

    const context = {
      phone: '5511999999999',
      name: 'Cliente',
      last_user_message: 'Pode mostrar o menu de opções?',
      user_id: 'user-123',
      flow_id: 'flow-456',
      intent: 'menu'
    };

    const baseResult = {
      node_id: menuNode.id,
      label: menuNode.data.label,
      session_id: mockSession.id,
      context
    };

    // Act
    const result = await (flowEngineService as any).executeAiAgent(
      menuNode,
      context,
      mockSession,
      baseResult
    );

    // Assert: Should return concrete menu options, not just "menu"
    const response = result.output.ai_response;
    
    // This assertion SHOULD FAIL on unfixed code (proving the bug exists)
    expect(response).not.toBe('menu');
    expect(response.length).toBeGreaterThan(20); // Should be a substantial response
    
    // Should contain menu-like structure (numbers or options)
    const hasMenuStructure = /[1-3]/.test(response) || 
                            response.includes('opção') || 
                            response.includes('escolha') ||
                            response.includes('agendar') && response.includes('cancelar');
    
    expect(hasMenuStructure).toBe(true);
    
    console.log('Menu request response:', response);
  });

  /**
   * Test that verifies nodes should complete sessions appropriately
   * instead of returning mock responses
   */
  test('should complete session or provide next steps instead of mock responses', async () => {
    // Arrange: Node that should handle completion scenarios
    const completionNode = {
      id: 'n_ai_completion',
      type: 'ai_agent', 
      data: {
        label: 'Session Completion Handler',
        system_prompt: 'Quando a conversa estiver completa ou o usuário agradecer, finalize adequadamente ou forneça próximos passos.',
        model: 'gpt-3.5-turbo'
      }
    };

    const completionMessages = [
      'Obrigado, isso é tudo que eu precisava!',
      'Perfeito, muito obrigado pela ajuda!',
      'Está tudo esclarecido, obrigado!',
      'Consegui resolver, valeu!'
    ];

    for (const message of completionMessages) {
      const context = {
        phone: '5511999999999',
        name: 'Cliente Satisfeito',
        last_user_message: message,
        user_id: 'user-123',
        flow_id: 'flow-456',
        intent: 'general'
      };

      const baseResult = {
        node_id: completionNode.id,
        label: completionNode.data.label,
        session_id: mockSession.id,
        context
      };

      // Act
      const result = await (flowEngineService as any).executeAiAgent(
        completionNode,
        context,
        mockSession,
        baseResult
      );

      // Assert: Should provide proper completion response, not mock keywords
      const response = result.output.ai_response;
      const mockKeywords = ['agendar', 'cancelar', 'duvida', 'menu'];
      
      // This assertion SHOULD FAIL on unfixed code
      expect(mockKeywords).not.toContain(response.toLowerCase().trim());
      expect(response.length).toBeGreaterThan(10);
      
      // Should contain completion-appropriate language
      const hasCompletionLanguage = response.includes('obrigad') || 
                                   response.includes('prazer') ||
                                   response.includes('ajudar') ||
                                   response.includes('precisar');
      
      expect(hasCompletionLanguage).toBe(true);
      
      console.log(`Completion test - Input: "${message}"`);
      console.log(`Output: "${response}"`);
    }
  });
});
