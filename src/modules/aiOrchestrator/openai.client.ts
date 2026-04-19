import OpenAI from 'openai';
import { OPENAI_CONFIG } from '../../config/openai.config';
import {
  InputMessage,
  ToolDefinition,
  ParsedResponse,
  ToolCall,
} from './types';

export interface OpenAIClientParams {
  instructions: string;
  input: InputMessage[];
  tools: ToolDefinition[];
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
}

export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export interface OpenAIResponse {
  id: string;
  output_text?: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: OPENAI_CONFIG.timeout,
    });
  }

  /**
   * Single OpenAI chat completion call — returns raw response including tool_calls.
   */
  async createResponse(params: OpenAIClientParams): Promise<OpenAIResponse> {
    const {
      instructions,
      input,
      tools,
      model = OPENAI_CONFIG.model,
      temperature = OPENAI_CONFIG.temperature,
      max_output_tokens = OPENAI_CONFIG.max_output_tokens,
      top_p = OPENAI_CONFIG.top_p,
    } = params;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: instructions },
      ...input.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as any,
      },
    }));

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= OPENAI_CONFIG.retry_attempts; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          messages,
          tools: openaiTools.length > 0 ? openaiTools : undefined,
          tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
          temperature,
          max_tokens: max_output_tokens,
          top_p,
        });

        const choice = completion.choices[0];
        return {
          id: completion.id,
          output_text: choice?.message?.content ?? null,
          tool_calls: choice?.message?.tool_calls ?? [],
          finish_reason: choice?.finish_reason ?? 'stop',
          usage: completion.usage
            ? {
                prompt_tokens: completion.usage.prompt_tokens,
                completion_tokens: completion.usage.completion_tokens,
                total_tokens: completion.usage.total_tokens,
              }
            : undefined,
        };
      } catch (error) {
        lastError = error as Error;
        if (error instanceof OpenAI.APIError) {
          if ([400, 401, 403].includes(error.status)) {
            throw new Error(`OpenAI API Error (${error.status}): ${error.message}`);
          }
        }
        if (attempt < OPENAI_CONFIG.retry_attempts) {
          const delay = OPENAI_CONFIG.retry_delay_base * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OpenAI API failed after ${OPENAI_CONFIG.retry_attempts} attempts: ${lastError?.message}`);
  }

  /**
   * Second call after tool execution — sends tool results back to get the final text response.
   */
  async createResponseWithToolResults(
    params: OpenAIClientParams,
    assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage,
    toolResults: ToolResultMessage[]
  ): Promise<OpenAIResponse> {
    const {
      instructions,
      input,
      tools,
      model = OPENAI_CONFIG.model,
      temperature = OPENAI_CONFIG.temperature,
      max_output_tokens = OPENAI_CONFIG.max_output_tokens,
      top_p = OPENAI_CONFIG.top_p,
    } = params;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: instructions },
      ...input.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      // The assistant message that triggered the tool calls
      assistantMessage as OpenAI.Chat.Completions.ChatCompletionMessageParam,
      // Tool results
      ...toolResults.map(tr => ({
        role: 'tool' as const,
        tool_call_id: tr.tool_call_id,
        content: tr.content,
      })),
    ];

    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as any,
      },
    }));

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= OPENAI_CONFIG.retry_attempts; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          model,
          messages,
          tools: openaiTools.length > 0 ? openaiTools : undefined,
          tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
          temperature,
          max_tokens: max_output_tokens,
          top_p,
        });

        const choice = completion.choices[0];
        return {
          id: completion.id,
          output_text: choice?.message?.content ?? null,
          tool_calls: choice?.message?.tool_calls ?? [],
          finish_reason: choice?.finish_reason ?? 'stop',
        };
      } catch (error) {
        lastError = error as Error;
        if (error instanceof OpenAI.APIError) {
          if ([400, 401, 403].includes(error.status)) {
            throw new Error(`OpenAI API Error (${error.status}): ${error.message}`);
          }
        }
        if (attempt < OPENAI_CONFIG.retry_attempts) {
          const delay = OPENAI_CONFIG.retry_delay_base * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`OpenAI API (tool results) failed after ${OPENAI_CONFIG.retry_attempts} attempts: ${lastError?.message}`);
  }

  parseResponse(response: OpenAIResponse): ParsedResponse {
    const toolCalls: ToolCall[] = [];

    if (response.tool_calls && Array.isArray(response.tool_calls)) {
      for (const toolCall of response.tool_calls) {
        if (toolCall.type === 'function' && toolCall.function) {
          toolCalls.push({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments || '{}',
            },
          });
        }
      }
    }

    return {
      output_text: response.output_text ?? null,
      tool_calls: toolCalls,
      response_id: response.id,
    };
  }
}
