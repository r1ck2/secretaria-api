import { describe, test, expect, vi, beforeEach } from 'vitest';
import { OpenAIClient, OpenAIResponse } from '../openai.client';
import { InputMessage, ToolDefinition } from '../types';

describe('OpenAI Client Unit Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    // Create client with dummy API key for testing parseResponse
    client = new OpenAIClient('test-api-key');
  });

  describe('parseResponse', () => {
    test('should parse response with tool_calls correctly', () => {
      const response: OpenAIResponse = {
        id: 'resp_123',
        output_text: 'I will check available slots for you.',
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'list_slots',
              arguments: '{}',
            },
          },
        ],
      };

      const parsed = client.parseResponse(response);

      expect(parsed.output_text).toBe('I will check available slots for you.');
      expect(parsed.tool_calls).toHaveLength(1);
      expect(parsed.tool_calls[0].id).toBe('call_abc');
      expect(parsed.tool_calls[0].function.name).toBe('list_slots');
      expect(parsed.tool_calls[0].function.arguments).toBe('{}');
      expect(parsed.response_id).toBe('resp_123');
    });

    test('should parse response without tool_calls correctly', () => {
      const response: OpenAIResponse = {
        id: 'resp_456',
        output_text: 'Hello! How can I help you today?',
        tool_calls: [],
      };

      const parsed = client.parseResponse(response);

      expect(parsed.output_text).toBe('Hello! How can I help you today?');
      expect(parsed.tool_calls).toHaveLength(0);
      expect(parsed.response_id).toBe('resp_456');
    });

    test('should handle null output_text', () => {
      const response: OpenAIResponse = {
        id: 'resp_789',
        output_text: null,
        tool_calls: [
          {
            id: 'call_def',
            type: 'function',
            function: {
              name: 'book_appointment',
              arguments: '{"slot_index": 1}',
            },
          },
        ],
      };

      const parsed = client.parseResponse(response);

      expect(parsed.output_text).toBeNull();
      expect(parsed.tool_calls).toHaveLength(1);
      expect(parsed.tool_calls[0].function.arguments).toBe('{"slot_index": 1}');
    });

    test('should throw error for invalid JSON in tool arguments', () => {
      const response: OpenAIResponse = {
        id: 'resp_error',
        output_text: 'Test',
        tool_calls: [
          {
            id: 'call_invalid',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: '{ invalid json',
            },
          },
        ],
      };

      expect(() => client.parseResponse(response)).toThrow(/Invalid JSON in tool call arguments/);
    });
  });

  describe('createResponse', () => {
    test.skip('createResponse tests require proper OpenAI mocking - skipping for now', () => {
      // These tests will be implemented when we have proper integration testing setup
    });
  });
});