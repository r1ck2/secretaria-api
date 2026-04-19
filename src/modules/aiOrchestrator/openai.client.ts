import OpenAI from 'openai';
import { OPENAI_CONFIG } from '../../config/openai.config';
import { 
  InputMessage, 
  ToolDefinition, 
  ParsedResponse, 
  ToolCall,
  ErrorType 
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

export interface OpenAIResponse {
  id: string;
  output_text?: string;
  tool_calls?: any[];
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
   * Chama OpenAI Responses API com contexto e tools
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

    // Convert input messages to OpenAI format
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: instructions,
      },
      ...input.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Convert tools to OpenAI format
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters as any, // Cast to satisfy OpenAI types
      },
    }));

    let lastError: Error | null = null;
    
    // Retry with exponential backoff
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
          store: OPENAI_CONFIG.store,
        });

        return {
          id: completion.id,
          output_text: completion.choices[0]?.message?.content || null,
          tool_calls: completion.choices[0]?.message?.tool_calls || [],
          usage: completion.usage ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          } : undefined,
        };
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (error instanceof OpenAI.APIError) {
          if (error.status === 400 || error.status === 401 || error.status === 403) {
            throw new Error(`OpenAI API Error (${error.status}): ${error.message}`);
          }
        }

        // Wait before retry (exponential backoff)
        if (attempt < OPENAI_CONFIG.retry_attempts) {
          const delay = OPENAI_CONFIG.retry_delay_base * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw new Error(`OpenAI API failed after ${OPENAI_CONFIG.retry_attempts} attempts: ${lastError?.message}`);
  }

  /**
   * Parseia resposta da API
   */
  parseResponse(response: OpenAIResponse): ParsedResponse {
    try {
      const toolCalls: ToolCall[] = [];

      if (response.tool_calls && Array.isArray(response.tool_calls)) {
        for (const toolCall of response.tool_calls) {
          if (toolCall.type === 'function' && toolCall.function) {
            // Validate that arguments is valid JSON
            let parsedArgs;
            try {
              parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch (parseError) {
              throw new Error(`Invalid JSON in tool call arguments: ${toolCall.function.arguments}`);
            }

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
        output_text: response.output_text || null,
        tool_calls: toolCalls,
        response_id: response.id,
      };
    } catch (error) {
      throw new Error(`Failed to parse OpenAI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}