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
          excludeEventIds: (context as any).cancelled_calendar_event_ids || [],
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
    // Format in Brazil timezone to show the correct local time
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', ' às');
  }

  /**
   * Generates slots without Google Calendar — delegates to calendar adapter logic.
   * Kept for fallback when calendarService is null.
   */
  private generateLocalSlots(
    startDate: Date,
    endDate: Date,
    workingDays: string[],
    workingStart: string,
    workingEnd: string
  ): { start: string; end: string; duration_minutes: number }[] {
    const TZ = 'America/Sao_Paulo';
    const [startH, startM] = workingStart.split(':').map(Number);
    const [endH, endM] = workingEnd.split(':').map(Number);
    const durationMinutes = 60;
    const slots: { start: string; end: string; duration_minutes: number }[] = [];

    const dayNames: Record<string, string> = {
      Sunday: 'dom', Monday: 'seg', Tuesday: 'ter', Wednesday: 'qua',
      Thursday: 'qui', Friday: 'sex', Saturday: 'sab',
    };

    // Start at working start today in Brazil TZ
    const todayStr = startDate.toLocaleDateString('en-CA', { timeZone: TZ });
    const [ty, tm, td] = todayStr.split('-').map(Number);

    // Build cursor at working start in Brazil TZ
    const buildCursor = (y: number, mo: number, d: number, h: number, mi: number): Date => {
      const sample = new Date(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:00`);
      const utcMs = new Date(sample.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
      const tzMs = new Date(sample.toLocaleString('en-US', { timeZone: TZ })).getTime();
      return new Date(sample.getTime() + (utcMs - tzMs));
    };

    let cursor = buildCursor(ty, tm, td, startH, startM);

    // Advance past current time
    const now = new Date();
    if (cursor <= now) {
      const nowTZ = now.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
      const [nh] = nowTZ.split(':').map(Number);
      cursor = buildCursor(ty, tm, td, nh + 1, 0);
    }

    let iterations = 0;
    while (cursor < endDate && slots.length < 4 && iterations < 200) {
      iterations++;
      const dayKey = dayNames[cursor.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })] || 'seg';
      const timeTZ = cursor.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
      const [cH, cM] = timeTZ.split(':').map(Number);
      const cursorMinutes = cH * 60 + cM;
      const endMinutes = endH * 60 + endM;

      if (workingDays.includes(dayKey) && cursorMinutes + durationMinutes <= endMinutes) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
        slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString(), duration_minutes: durationMinutes });
        cursor = new Date(cursor.getTime() + durationMinutes * 60000);
      } else {
        const nextDayStr = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-CA', { timeZone: TZ });
        const [ny, nm, nd] = nextDayStr.split('-').map(Number);
        cursor = buildCursor(ny, nm, nd, startH, startM);
      }
    }

    return slots;
  }
}