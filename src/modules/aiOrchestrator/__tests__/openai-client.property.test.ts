import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { OpenAIClient, OpenAIResponse } from '../openai.client';

describe('Feature: ai-scheduling-refactoring - OpenAI Client Property Tests', () => {
  
  // Property 46: OpenAI Response Parsing
  test('Property 46: OpenAI Response Parsing - output_text field extraction', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          output_text: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
          tool_calls: fc.constant([]) as any,
        }) as any,
        (response: OpenAIResponse) => {
          const client = new OpenAIClient('test-key');
          const parsed = client.parseResponse(response);
          
          // The parser SHALL extract the output_text field
          // Note: parseResponse uses || null, so empty strings become null
          const expectedOutputText = response.output_text || null;
          expect(parsed.output_text).toBe(expectedOutputText);
          expect(parsed.response_id).toBe(response.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 47: Tool Calls Extraction
  test('Property 47: Tool Calls Extraction - extract tool_calls when present', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          output_text: fc.string(),
          tool_calls: fc.array(
            fc.record({
              id: fc.string({ minLength: 1 }),
              type: fc.constant('function'),
              function: fc.record({
                name: fc.string({ minLength: 1 }),
                arguments: fc.string().map(s => JSON.stringify({ param: s })),
              }),
            }),
            { maxLength: 3 }
          ),
        }),
        (response: OpenAIResponse) => {
          const client = new OpenAIClient('test-key');
          const parsed = client.parseResponse(response);
          
          // The parser SHALL extract tool_calls when present
          expect(parsed.tool_calls).toHaveLength(response.tool_calls?.length || 0);
          
          if (response.tool_calls && response.tool_calls.length > 0) {
            response.tool_calls.forEach((toolCall, index) => {
              expect(parsed.tool_calls[index].id).toBe(toolCall.id);
              expect(parsed.tool_calls[index].type).toBe('function');
              expect(parsed.tool_calls[index].function.name).toBe(toolCall.function.name);
              expect(parsed.tool_calls[index].function.arguments).toBe(toolCall.function.arguments);
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 48: Tool Arguments JSON Validation
  test('Property 48: Tool Arguments JSON Validation - validate arguments is valid JSON', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          output_text: fc.string(),
          tool_calls: fc.array(
            fc.record({
              id: fc.string({ minLength: 1 }),
              type: fc.constant('function'),
              function: fc.record({
                name: fc.string({ minLength: 1 }),
                arguments: fc.oneof(
                  // Valid JSON
                  fc.string().map(s => JSON.stringify({ param: s })),
                  // Sometimes empty object
                  fc.constant('{}'),
                  // Sometimes with multiple fields
                  fc.record({
                    slot_index: fc.integer({ min: 1, max: 4 }),
                    title: fc.string(),
                  }).map(obj => JSON.stringify(obj))
                ),
              }),
            }),
            { maxLength: 2 }
          ),
        }),
        (response: OpenAIResponse) => {
          const client = new OpenAIClient('test-key');
          
          // Should not throw for valid JSON arguments
          expect(() => client.parseResponse(response)).not.toThrow();
          
          const parsed = client.parseResponse(response);
          
          // All parsed tool calls should have valid JSON arguments
          parsed.tool_calls.forEach(toolCall => {
            expect(() => JSON.parse(toolCall.function.arguments)).not.toThrow();
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 48b: Invalid JSON should throw error
  test('Property 48b: Invalid JSON arguments should cause parsing error', () => {
    const invalidJsonResponse: OpenAIResponse = {
      id: 'test-id',
      output_text: 'Test response',
      tool_calls: [{
        id: 'call-123',
        type: 'function',
        function: {
          name: 'test_tool',
          arguments: '{ invalid json }', // Invalid JSON
        },
      }],
    };

    const client = new OpenAIClient('test-key');
    
    // Should throw error for invalid JSON
    expect(() => client.parseResponse(invalidJsonResponse)).toThrow(/Invalid JSON in tool call arguments/);
  });

  // Property 50: Parsed Response Structure Consistency
  test('Property 50: Parsed Response Structure Consistency - consistent structure', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1 }),
          output_text: fc.oneof(fc.string(), fc.constant(null)),
          tool_calls: fc.oneof(
            fc.constant([]),
            fc.array(
              fc.record({
                id: fc.string({ minLength: 1 }),
                type: fc.constant('function'),
                function: fc.record({
                  name: fc.string({ minLength: 1 }),
                  arguments: fc.string().map(s => JSON.stringify({ param: s })),
                }),
              }),
              { maxLength: 3 }
            )
          ),
        }) as any,
        (response: OpenAIResponse) => {
          const client = new OpenAIClient('test-key');
          const parsed = client.parseResponse(response);
          
          // Should always have consistent structure
          expect(parsed).toHaveProperty('output_text');
          expect(parsed).toHaveProperty('tool_calls');
          expect(parsed).toHaveProperty('response_id');
          
          // output_text should be string or null
          expect(typeof parsed.output_text === 'string' || parsed.output_text === null).toBe(true);
          
          // tool_calls should be array
          expect(Array.isArray(parsed.tool_calls)).toBe(true);
          
          // response_id should be string
          expect(typeof parsed.response_id).toBe('string');
          expect(parsed.response_id.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});