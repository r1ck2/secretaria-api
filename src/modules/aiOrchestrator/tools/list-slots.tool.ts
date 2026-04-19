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

      // Extract working hours/days from context if configured
      const ctx = context as any;
      const workingDays: string[] = ctx.working_days || ['seg', 'ter', 'qua', 'qui', 'sex'];
      const workingStart: string = ctx.working_hours_start || '09:00';
      const workingEnd: string = ctx.working_hours_end || '18:00';
      const useGoogleCalendar = ctx.use_google_calendar !== false;

      let availableSlots: any[] = [];

      if (useGoogleCalendar && this.calendarService) {
        // Call calendar service to get available slots
        availableSlots = await this.calendarService.listAvailableSlots({
          userId: context.user_id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          maxSlots: 4,
          workingDays,
          workingHoursStart: workingStart,
          workingHoursEnd: workingEnd,
        });
      } else {
        // Generate slots based on working hours without Google Calendar
        availableSlots = this.generateLocalSlots(startDate, endDate, workingDays, workingStart, workingEnd);
      }

      // Format slots for AI consumption
      const formattedSlots: Slot[] = availableSlots.map((slot: any, index: number) => ({
        index: index + 1,
        label: this.formatSlotLabel(slot.start),
        start: slot.start,
        end: slot.end,
        duration_minutes: slot.duration_minutes || 60,
      }));

      // Update context with slots and clear any previous confirmation state
      context.slots = formattedSlots;
      (context as any).pending_slot_confirmation = null;
      (context as any).last_booked_appointment = null;

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'list_slots completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        slots_found: formattedSlots.length,
      });

      return {
        slots: formattedSlots,
        message: formattedSlots.length > 0
          ? `${formattedSlots.length} horários disponíveis encontrados.`
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

  /**
   * Generates available slots based on working hours without Google Calendar.
   * Returns up to 4 slots within the next 7 days respecting working days/hours.
   */
  private generateLocalSlots(
    startDate: Date,
    endDate: Date,
    workingDays: string[],
    workingStart: string,
    workingEnd: string
  ): { start: string; end: string; duration_minutes: number }[] {
    const DAY_MAP: Record<number, string> = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom' };
    const [startH, startM] = workingStart.split(':').map(Number);
    const [endH, endM] = workingEnd.split(':').map(Number);
    const durationMinutes = 60;
    const slots: { start: string; end: string; duration_minutes: number }[] = [];

    const cursor = new Date(startDate);
    cursor.setHours(startH, startM, 0, 0);
    // If current time is past start, move to next slot
    if (cursor <= new Date()) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    }

    while (cursor < endDate && slots.length < 4) {
      const dayKey = DAY_MAP[cursor.getDay()];
      const cursorH = cursor.getHours();
      const cursorM = cursor.getMinutes();
      const endMinutes = endH * 60 + endM;
      const cursorMinutes = cursorH * 60 + cursorM;

      if (workingDays.includes(dayKey) && cursorMinutes + durationMinutes <= endMinutes) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
        slots.push({
          start: cursor.toISOString(),
          end: slotEnd.toISOString(),
          duration_minutes: durationMinutes,
        });
        cursor.setTime(cursor.getTime() + durationMinutes * 60000);
      } else {
        // Move to next day at working start
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(startH, startM, 0, 0);
      }
    }

    return slots;
  }
}