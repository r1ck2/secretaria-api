import { AbstractTool } from './base-tool';
import { SessionContext } from '../types';
import { LogAction } from '../types';

export class CreateTodoTool extends AbstractTool {
  constructor(
    private kanbanService: any,
    logService: any
  ) {
    super(logService);
  }

  async execute(args: Record<string, any>, context: SessionContext): Promise<{
    card: any;
    message: string;
  }> {
    const { title, priority = 'medium' } = args;

    this.log(LogAction.TOOL_EXECUTION_START, 'Starting create_todo execution', {
      user_id: context.user_id,
      phone: context.phone,
      title,
      priority,
    });

    try {
      // Validate required fields
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Título é obrigatório e deve ser uma string não vazia.');
      }

      // Validate priority
      const validPriorities = ['high', 'medium', 'low'];
      if (!validPriorities.includes(priority)) {
        throw new Error(`Prioridade deve ser uma das opções: ${validPriorities.join(', ')}`);
      }

      // Create Kanban card
      const cardData = {
        title: title.trim(),
        description: `Criado automaticamente via AI Orchestrator\nCliente: ${context.name || 'N/A'}\nTelefone: ${context.phone}`,
        priority,
        user_id: context.user_id, // Professional who owns the card
        customer_id: context.customer_id || null,
        status: 'todo', // Initial column
        created_via: 'ai_orchestrator',
        metadata: {
          phone: context.phone,
          customer_name: context.name,
          session_context: 'ai_scheduling',
        },
      };

      const card = await this.kanbanService.createCard(cardData);

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'create_todo completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        card_id: card.id,
        title: card.title,
        priority: card.priority,
      });

      return {
        card,
        message: `Cartão criado no seu quadro Kanban: "${card.title}" (Prioridade: ${priority})`,
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'create_todo',
        title,
        priority,
      });

      throw new Error(`Erro ao criar cartão Kanban: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}