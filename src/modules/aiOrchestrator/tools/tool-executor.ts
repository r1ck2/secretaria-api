import { ToolDefinition, ToolExecutionResult, SessionContext, ToolName } from '../types';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ListSlotsTool } from './list-slots.tool';
import { BookAppointmentTool } from './book-appointment.tool';
import { CancelAppointmentTool } from './cancel-appointment.tool';
import { CreateTodoTool } from './create-todo.tool';
import { RegisterCustomerTool } from './register-customer.tool';

export interface ToolExecutorDependencies {
  calendarService: any; // Will be properly typed when we integrate
  customerService: any;
  appointmentService: any;
  kanbanService: any;
  logService: any;
}

export class ToolExecutor {
  private listSlotsTool: ListSlotsTool;
  private bookAppointmentTool: BookAppointmentTool;
  private cancelAppointmentTool: CancelAppointmentTool;
  private createTodoTool: CreateTodoTool;
  private registerCustomerTool: RegisterCustomerTool;

  constructor(private dependencies: ToolExecutorDependencies) {
    // Initialize tool implementations
    this.listSlotsTool = new ListSlotsTool(dependencies.calendarService, dependencies.logService);
    this.bookAppointmentTool = new BookAppointmentTool(
      dependencies.calendarService,
      dependencies.appointmentService,
      dependencies.logService
    );
    this.cancelAppointmentTool = new CancelAppointmentTool(
      dependencies.calendarService,
      dependencies.appointmentService,
      dependencies.logService
    );
    this.createTodoTool = new CreateTodoTool(dependencies.kanbanService, dependencies.logService);
    this.registerCustomerTool = new RegisterCustomerTool(dependencies.customerService, dependencies.logService);
  }

  /**
   * Executa uma tool específica
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: SessionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate tool exists
      if (!this.isValidToolName(toolName)) {
        return {
          success: false,
          error: `Tool not found: ${toolName}`,
          metadata: { execution_time_ms: Date.now() - startTime }
        };
      }

      // Validate parameters using JSON Schema
      const toolDefinition = this.getToolDefinition(toolName);
      if (!toolDefinition) {
        return {
          success: false,
          error: `Tool definition not found: ${toolName}`,
          metadata: { execution_time_ms: Date.now() - startTime }
        };
      }

      const validationResult = this.validateParameters(toolDefinition, args);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${validationResult.error}`,
          metadata: { 
            execution_time_ms: Date.now() - startTime,
            validation_errors: validationResult.errors
          }
        };
      }

      // Execute the appropriate tool
      let result: any;
      switch (toolName as ToolName) {
        case 'list_slots':
          result = await this.listSlotsTool.execute(args, context);
          break;
        case 'set_pending_slot':
          result = this.executePendingSlot(args, context);
          break;
        case 'book_appointment':
          result = await this.bookAppointmentTool.execute(args, context);
          break;
        case 'cancel_appointment':
          result = await this.cancelAppointmentTool.execute(args, context);
          break;
        case 'create_todo':
          result = await this.createTodoTool.execute(args, context);
          break;
        case 'register_customer':
          result = await this.registerCustomerTool.execute(args, context);
          break;
        default:
          return {
            success: false,
            error: `Tool not implemented: ${toolName}`,
            metadata: { execution_time_ms: Date.now() - startTime }
          };
      }

      return {
        success: true,
        data: result,
        metadata: { 
          execution_time_ms: Date.now() - startTime,
          tool_name: toolName
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: { 
          execution_time_ms: Date.now() - startTime,
          stack_trace: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  /**
   * Retorna definições de todas as tools disponíveis
   */
  getToolDefinitions(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  /**
   * Registra o slot escolhido pelo cliente no contexto para confirmação posterior.
   */
  private executePendingSlot(args: Record<string, any>, context: SessionContext): ToolExecutionResult {
    const { slot_index } = args;
    if (!context.slots || context.slots.length === 0) {
      return { success: false, error: 'Nenhum slot disponível no contexto. Chame list_slots primeiro.' };
    }
    if (slot_index < 1 || slot_index > context.slots.length) {
      return { success: false, error: `Índice inválido. Escolha entre 1 e ${context.slots.length}.` };
    }
    const slot = context.slots[slot_index - 1];
    (context as any).pending_slot_confirmation = slot;
    return {
      success: true,
      data: { pending_slot_confirmation: slot },
    };
  }

  private isValidToolName(toolName: string): toolName is ToolName {
    const validNames: ToolName[] = ['list_slots', 'set_pending_slot', 'book_appointment', 'cancel_appointment', 'create_todo', 'register_customer'];
    return validNames.includes(toolName as ToolName);
  }

  private getToolDefinition(toolName: string): ToolDefinition | undefined {
    return TOOL_DEFINITIONS.find(def => def.function.name === toolName);
  }

  private validateParameters(toolDefinition: ToolDefinition, args: Record<string, any>): {
    valid: boolean;
    error?: string;
    errors?: string[];
  } {
    const { parameters } = toolDefinition.function;
    const errors: string[] = [];

    // Check required parameters
    if (parameters.required && Array.isArray(parameters.required)) {
      for (const requiredParam of parameters.required) {
        if (!(requiredParam in args) || args[requiredParam] === undefined || args[requiredParam] === null) {
          errors.push(`Missing required parameter: ${requiredParam}`);
        }
      }
    }

    // Basic type validation for known parameters
    if (parameters.properties) {
      for (const [paramName, paramSchema] of Object.entries(parameters.properties)) {
        if (paramName in args && args[paramName] !== undefined) {
          const value = args[paramName];
          const schema = paramSchema as any;

          // Type validation
          if (schema.type === 'string' && typeof value !== 'string') {
            errors.push(`Parameter ${paramName} must be a string`);
          } else if (schema.type === 'number' && typeof value !== 'number') {
            errors.push(`Parameter ${paramName} must be a number`);
          } else if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`Parameter ${paramName} must be one of: ${schema.enum.join(', ')}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}