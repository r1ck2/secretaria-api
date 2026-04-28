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
      const ctx = context as any;
      const workingDays: string[] = ctx.working_days || ['seg', 'ter', 'qua', 'qui', 'sex'];
      const workingStart: string = ctx.working_hours_start || '09:00';
      const workingEnd: string = ctx.working_hours_end || '18:00';
      const useGoogleCalendar = ctx.use_google_calendar !== false;

      // Determine search window
      const { target_time } = args;
      const show_all: boolean = args.show_all === true;
      // Normalize target_date: accept DD/MM, DD/MM/YYYY, YYYY-MM-DD, or partial formats
      const target_date = this.normalizeTargetDate(args.target_date);
      let startDate: Date;
      let endDate: Date;
      let maxSlots = show_all ? 20 : 4;

      if (target_date) {
        // Parse target_date as Brazil timezone midnight to avoid UTC day-shift bug
        // "2025-04-28" → 2025-04-28T00:00:00-03:00 (not UTC midnight)
        startDate = new Date(`${target_date}T00:00:00-03:00`);
        endDate = new Date(`${target_date}T23:59:59-03:00`);
        if (target_time) {
          maxSlots = 1;
        }
        // show_all with a specific date: search the full day with maxSlots = 20
        // (maxSlots already set to 20 above when show_all is true)
      } else {
        startDate = new Date();
        endDate = new Date();
        // show_all without a date: expand window to 7 days (same as default, maxSlots already 20)
        endDate.setDate(startDate.getDate() + 7);
      }

      let availableSlots: any[] = [];

      if (useGoogleCalendar && this.calendarService) {
        availableSlots = await this.calendarService.listAvailableSlots({
          userId: context.user_id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          maxSlots,
          workingDays,
          workingHoursStart: workingStart,
          workingHoursEnd: workingEnd,
          excludeEventIds: ctx.cancelled_calendar_event_ids || [],
          targetTime: target_time,
        });

        // If target_date was specified but no slots found, expand to next 7 days
        if (target_date && availableSlots.length === 0) {
          const fallbackEnd = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          availableSlots = await this.calendarService.listAvailableSlots({
            userId: context.user_id,
            startDate: new Date().toISOString(),
            endDate: fallbackEnd.toISOString(),
            maxSlots,
            workingDays,
            workingHoursStart: workingStart,
            workingHoursEnd: workingEnd,
            excludeEventIds: ctx.cancelled_calendar_event_ids || [],
          });
        }
      } else {
        availableSlots = this.generateLocalSlots(startDate, endDate, workingDays, workingStart, workingEnd, target_time, maxSlots);

        // Fallback if no slots on target_date
        if (target_date && availableSlots.length === 0) {
          const fallbackEnd = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          availableSlots = this.generateLocalSlots(new Date(), fallbackEnd, workingDays, workingStart, workingEnd, undefined, maxSlots);
        }
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

  /**
   * Normalizes any date format to YYYY-MM-DD using the current year.
   * Accepts: "28/04", "28/04/2023", "2023-04-28", "28-04", etc.
   * Always uses the current year if year is missing or wrong (past year).
   * Returns null if input is falsy or unparseable.
   */
  private normalizeTargetDate(raw: string | undefined | null): string | null {
    if (!raw) return null;

    const TZ = 'America/Sao_Paulo';
    const nowBR = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
    const currentYear = parseInt(nowBR.split('-')[0], 10);
    const todayMs = new Date(`${nowBR}T00:00:00-03:00`).getTime();

    let day: number | null = null;
    let month: number | null = null;
    let year: number = currentYear;

    // Try DD/MM/YYYY or DD/MM
    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slashMatch) {
      day = parseInt(slashMatch[1], 10);
      month = parseInt(slashMatch[2], 10);
      if (slashMatch[3]) {
        const y = parseInt(slashMatch[3], 10);
        year = y < 100 ? 2000 + y : y;
      }
    }

    // Try YYYY-MM-DD
    if (!day) {
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        year = parseInt(isoMatch[1], 10);
        month = parseInt(isoMatch[2], 10);
        day = parseInt(isoMatch[3], 10);
      }
    }

    // Try DD-MM or DD-MM-YYYY
    if (!day) {
      const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})(?:-(\d{2,4}))?$/);
      if (dashMatch) {
        day = parseInt(dashMatch[1], 10);
        month = parseInt(dashMatch[2], 10);
        if (dashMatch[3]) {
          const y = parseInt(dashMatch[3], 10);
          year = y < 100 ? 2000 + y : y;
        }
      }
    }

    if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;

    // Always use current year if year provided is in the past
    const pad = (n: number) => String(n).padStart(2, '0');
    let candidate = `${year}-${pad(month)}-${pad(day)}`;
    let candidateMs = new Date(`${candidate}T00:00:00-03:00`).getTime();

    // If the date is in the past, try next year
    if (candidateMs < todayMs) {
      year = currentYear + 1;
      candidate = `${year}-${pad(month)}-${pad(day)}`;
      candidateMs = new Date(`${candidate}T00:00:00-03:00`).getTime();
    }

    // Final check: must be >= today
    if (candidateMs < todayMs) return null;

    return candidate;
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
   * Generates slots without Google Calendar — timezone-aware (America/Sao_Paulo).
   */
  private generateLocalSlots(
    startDate: Date,
    endDate: Date,
    workingDays: string[],
    workingStart: string,
    workingEnd: string,
    targetTime?: string,
    maxSlots: number = 4
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

    // Only advance past current time if startDate is today
    const now = new Date();
    const isToday = todayStr === now.toLocaleDateString('en-CA', { timeZone: TZ });
    if (isToday && cursor <= now) {
      const nowTZ = now.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
      const [nh] = nowTZ.split(':').map(Number);
      cursor = buildCursor(ty, tm, td, nh + 1, 0);
    }

    let iterations = 0;
    while (cursor < endDate && slots.length < maxSlots && iterations < 200) {
      iterations++;
      const dayKey = dayNames[cursor.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })] || 'seg';
      const timeTZ = cursor.toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
      const [cH, cM] = timeTZ.split(':').map(Number);
      const cursorMinutes = cH * 60 + cM;
      const endMinutes = endH * 60 + endM;

      if (workingDays.includes(dayKey) && cursorMinutes + durationMinutes <= endMinutes) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

        // If targetTime specified, only include slots matching that time
        const matchesTarget = !targetTime || timeTZ.startsWith(targetTime.slice(0, 5));
        if (matchesTarget) {
          slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString(), duration_minutes: durationMinutes });
        }
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