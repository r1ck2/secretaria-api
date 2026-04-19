import { AbstractTool } from './base-tool';
import { SessionContext, Slot } from '../types';
import { LogAction } from '../types';

export class ListSlotsTool extends AbstractTool {
  constructor(
    private calendarService: any,
    logService: any
  ) {
    super(logService);
  }

  async execute(args: Record<string, any>, context: SessionContext): Promise<{
    slots: Slot[];
    message: string;
  }> {
    this.log(LogAction.TOOL_EXECUTION_START, 'Starting list_slots execution', {
      user_id: context.user_id,
      phone: context.phone,
    });

    try {
      // Get professional's calendar events for the next 7 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 7);

      // Call calendar service to get available slots
      const availableSlots = await this.calendarService.listAvailableSlots({
        userId: context.user_id,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        maxSlots: 4,
      });

      // Format slots for AI consumption
      const formattedSlots: Slot[] = availableSlots.map((slot: any, index: number) => ({
        index: index + 1,
        label: this.formatSlotLabel(slot.start),
        start: slot.start,
        end: slot.end,
        duration_minutes: slot.duration_minutes || 60,
      }));

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'list_slots completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        slots_found: formattedSlots.length,
      });

      return {
        slots: formattedSlots,
        message: formattedSlots.length > 0 
          ? `Encontrei ${formattedSlots.length} horários disponíveis nos próximos 7 dias.`
          : 'Não há horários disponíveis nos próximos 7 dias.',
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'list_slots',
      });

      throw new Error(`Erro ao buscar horários disponíveis: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  private formatSlotLabel(isoDateTime: string): string {
    const date = new Date(isoDateTime);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  }
}