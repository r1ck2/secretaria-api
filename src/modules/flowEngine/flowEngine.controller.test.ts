import { Request, Response } from 'express';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { triggerFlowEvolution } from './flowEngine.controller';
import { FlowEngineService } from './flowEngine.service';
import { WhatsappConnection } from '@/modules/whatsapp/whatsapp.entity';
import { evolutionApiService } from '@/modules/evolution/evolution.service';
import { logService } from '@/modules/log/log.service';

// Mock dependencies
vi.mock('./flowEngine.service');
vi.mock('@/modules/whatsapp/whatsapp.entity');
vi.mock('@/modules/evolution/evolution.service');
vi.mock('@/modules/log/log.service');

describe('Bug Condition Exploration - Duplicate Messages Evolution API', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock request
    mockReq = {
      body: {
        event: 'MESSAGES_UPSERT',
        instance: 'test-instance',
        data: {
          key: {
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: false
          },
          message: {
            conversation: 'Olá, preciso de ajuda'
          }
        }
      }
    };

    // Mock response
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    // Mock WhatsappConnection.findOne
    vi.mocked(WhatsappConnection.findOne).mockResolvedValue({
      id: 1,
      user_id: 'user-123',
      phone_number: '5511888888888',
      evolution_instance_name: 'test-instance',
      evolution_instance_apikey: 'test-api-key'
    } as any);

    // Mock logService methods
    vi.mocked(logService.logEvolution).mockResolvedValue(undefined);
  });

  /**
   * **Validates: Requirements 2.2**
   * 
   * Bug Condition Exploration Test - Duplicate Messages
   * 
   * This test SHOULD FAIL on unfixed code to confirm the bug exists.
   * The test simulates a webhook from Evolution API where the flow generates
   * multiple responses and verifies that each unique message is sent only once.
   * 
   * Expected behavior on UNFIXED code: Test FAILS (messages are duplicated)
   * Expected behavior on FIXED code: Test PASSES (no duplicate messages)
   */
  test('should send each unique message only once when flow generates multiple responses', async () => {
    // Arrange: Mock flow engine to return multiple results with some duplicate messages
    const mockResults = [
      {
        node_id: 'node-1',
        node_type: 'ai_agent',
        label: 'Welcome Node',
        status: 'executed' as const,
        output: { message_sent: 'Olá! Como posso ajudar você hoje?' },
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-2', 
        node_type: 'send_message',
        label: 'Menu Node',
        status: 'executed' as const,
        output: { message_sent: 'Escolha uma opção:\n1. Agendar consulta\n2. Falar com atendente' },
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-3',
        node_type: 'ai_agent', 
        label: 'Duplicate Welcome',
        status: 'executed' as const,
        output: { message_sent: 'Olá! Como posso ajudar você hoje?' }, // DUPLICATE MESSAGE
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-4',
        node_type: 'send_message',
        label: 'Another Menu',
        status: 'executed' as const,
        output: { message_sent: 'Escolha uma opção:\n1. Agendar consulta\n2. Falar com atendente' }, // DUPLICATE MESSAGE
        session_id: 'session-123',
        context: {}
      }
    ];

    // Mock the FlowEngineService instance and its methods
    const mockEngineService = {
      receiveMessage: vi.fn().mockResolvedValue(mockResults)
    };
    vi.mocked(FlowEngineService).mockImplementation(() => mockEngineService as any);

    // Mock evolutionApiService.sendTextMessage
    vi.mocked(evolutionApiService.sendTextMessage).mockResolvedValue(undefined);

    // Act: Trigger the Evolution webhook
    await triggerFlowEvolution(mockReq as Request, mockRes as Response);

    // Assert: Each unique message should be sent only once
    const sendTextMessageCalls = vi.mocked(evolutionApiService.sendTextMessage).mock.calls;
    
    // Count occurrences of each message
    const messageCounts = new Map<string, number>();
    sendTextMessageCalls.forEach(call => {
      const message = call[3]; // message is the 4th parameter
      messageCounts.set(message, (messageCounts.get(message) || 0) + 1);
    });

    // Verify no message was sent more than once
    const duplicateMessages: string[] = [];
    messageCounts.forEach((count, message) => {
      if (count > 1) {
        duplicateMessages.push(`"${message}" sent ${count} times`);
      }
    });

    // This assertion SHOULD FAIL on unfixed code (proving the bug exists)
    expect(duplicateMessages).toEqual([]);
    
    // Additional assertions for clarity
    expect(sendTextMessageCalls).toHaveLength(2); // Should send only 2 unique messages
    expect(messageCounts.get('Olá! Como posso ajudar você hoje?')).toBe(1);
    expect(messageCounts.get('Escolha uma opção:\n1. Agendar consulta\n2. Falar com atendente')).toBe(1);
  });

  test('should handle empty messages correctly without sending duplicates', async () => {
    // Arrange: Mock flow with empty and valid messages
    const mockResults = [
      {
        node_id: 'node-1',
        node_type: 'ai_agent',
        label: 'Empty Node',
        status: 'executed' as const,
        output: { message_sent: '' }, // Empty message
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-2',
        node_type: 'send_message', 
        label: 'Valid Node',
        status: 'executed' as const,
        output: { message_sent: 'Mensagem válida' },
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-3',
        node_type: 'ai_agent',
        label: 'Whitespace Node', 
        status: 'executed' as const,
        output: { message_sent: '   ' }, // Whitespace only
        session_id: 'session-123',
        context: {}
      }
    ];

    const mockEngineService = {
      receiveMessage: vi.fn().mockResolvedValue(mockResults)
    };
    vi.mocked(FlowEngineService).mockImplementation(() => mockEngineService as any);
    vi.mocked(evolutionApiService.sendTextMessage).mockResolvedValue(undefined);

    // Act
    await triggerFlowEvolution(mockReq as Request, mockRes as Response);

    // Assert: Only valid messages should be sent
    const sendTextMessageCalls = vi.mocked(evolutionApiService.sendTextMessage).mock.calls;
    expect(sendTextMessageCalls).toHaveLength(1);
    expect(sendTextMessageCalls[0][3]).toBe('Mensagem válida');
  });

  test('should handle multiple identical messages from different node types', async () => {
    // Arrange: Same message from different node types
    const duplicateMessage = 'Obrigado pelo contato! Em breve retornaremos.';
    const mockResults = [
      {
        node_id: 'node-ai',
        node_type: 'ai_agent',
        label: 'AI Response',
        status: 'executed' as const,
        output: { message_sent: duplicateMessage },
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-send',
        node_type: 'send_message',
        label: 'Send Message',
        status: 'executed' as const,
        output: { message_sent: duplicateMessage }, // Same message
        session_id: 'session-123',
        context: {}
      },
      {
        node_id: 'node-confirm',
        node_type: 'send_confirmation',
        label: 'Confirmation',
        status: 'executed' as const,
        output: { message_sent: duplicateMessage }, // Same message again
        session_id: 'session-123',
        context: {}
      }
    ];

    const mockEngineService = {
      receiveMessage: vi.fn().mockResolvedValue(mockResults)
    };
    vi.mocked(FlowEngineService).mockImplementation(() => mockEngineService as any);
    vi.mocked(evolutionApiService.sendTextMessage).mockResolvedValue(undefined);

    // Act
    await triggerFlowEvolution(mockReq as Request, mockRes as Response);

    // Assert: Message should be sent only once despite multiple nodes generating it
    const sendTextMessageCalls = vi.mocked(evolutionApiService.sendTextMessage).mock.calls;
    
    // This SHOULD FAIL on unfixed code (proving duplicate bug exists)
    expect(sendTextMessageCalls).toHaveLength(1);
    expect(sendTextMessageCalls[0][3]).toBe(duplicateMessage);
  });
});