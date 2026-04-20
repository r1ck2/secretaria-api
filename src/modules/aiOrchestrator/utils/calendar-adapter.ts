import { CalendarService } from '@/modules/calendar/calendar.service';

// Brazil timezone — used for all slot generation
const TZ = 'America/Sao_Paulo';

/**
 * Returns a Date object representing the given wall-clock time in Brazil timezone.
 * e.g. toTZDate(2025, 4, 20, 9, 0) → Date for 2025-04-20T09:00:00-03:00
 */
function toTZDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Build an ISO string as if it were local Brazil time, then parse
  const pad = (n: number) => String(n).padStart(2, '0');
  // Use Intl to get the UTC offset for Brazil at this moment
  const sample = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // Get the UTC offset by comparing UTC time with Brazil time
  const utcDate = new Date(sample.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(sample.toLocaleString('en-US', { timeZone: TZ }));
  const offsetMs = utcDate.getTime() - tzDate.getTime();
  return new Date(sample.getTime() + offsetMs);
}

/**
 * Format a Date as HH:MM in Brazil timezone.
 */
function formatInTZ(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get the day-of-week key in Brazil timezone.
 */
function getDayKeyInTZ(date: Date): string {
  const dayIndex = parseInt(
    date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })
      .toLowerCase()
      .slice(0, 3)
      .replace('sun', '0').replace('mon', '1').replace('tue', '2')
      .replace('wed', '3').replace('thu', '4').replace('fri', '5').replace('sat', '6'),
    10
  );
  const DAY_MAP: Record<number, string> = { 0: 'dom', 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab' };
  // Use getDay() in TZ
  const tzDateStr = date.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
  const dayNames: Record<string, string> = {
    Sunday: 'dom', Monday: 'seg', Tuesday: 'ter', Wednesday: 'qua',
    Thursday: 'qui', Friday: 'sex', Saturday: 'sab',
  };
  return dayNames[tzDateStr] || 'seg';
}

/**
 * Get hour and minute of a Date in Brazil timezone.
 */
function getHourMinuteInTZ(date: Date): { hour: number; minute: number } {
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [h, m] = timeStr.split(':').map(Number);
  return { hour: h, minute: m };
}

/**
 * Adapts CalendarService to the interface expected by AI Orchestrator tools.
 */
export class CalendarServiceAdapter {
  private service: CalendarService;

  constructor() {
    this.service = new CalendarService();
  }

  async createEvent(params: {
    userId: string;
    title: string;
    description?: string;
    start: string;
    end: string;
    attendees?: { email: string }[];
  }): Promise<{ id: string }> {
    const event = await this.service.createEvent(params.userId, {
      summary: params.title,
      description: params.description,
      start_date_time: params.start,
      end_date_time: params.end,
    });
    return { id: event.id! };
  }

  async deleteEvent(params: { userId: string; eventId: string }): Promise<void> {
    await this.service.cancelEvent(params.userId, params.eventId);
  }

  async listAvailableSlots(params: {
    userId: string;
    startDate: string;
    endDate: string;
    maxSlots: number;
    workingDays?: string[];
    workingHoursStart?: string;
    workingHoursEnd?: string;
    excludeEventIds?: string[]; // calendar event IDs to exclude (e.g. just-cancelled)
  }): Promise<{ start: string; end: string; duration_minutes: number }[]> {
    const workingDays = params.workingDays || ['seg', 'ter', 'qua', 'qui', 'sex'];
    const [startH, startM] = (params.workingHoursStart || '09:00').split(':').map(Number);
    const [endH, endM] = (params.workingHoursEnd || '18:00').split(':').map(Number);
    const durationMinutes = 60;
    const excludeIds = new Set(params.excludeEventIds || []);

    // Fetch existing calendar events to avoid conflicts
    let busyTimes: { start: number; end: number }[] = [];
    try {
      const events = await this.service.listEvents(params.userId, params.startDate, params.endDate);
      busyTimes = events
        .filter((e: any) => e.start?.dateTime && e.end?.dateTime && !excludeIds.has(e.id))
        .map((e: any) => ({
          start: new Date(e.start.dateTime).getTime(),
          end: new Date(e.end.dateTime).getTime(),
        }));
    } catch {
      // Calendar not connected — generate slots without conflict check
    }

    const slots: { start: string; end: string; duration_minutes: number }[] = [];

    // Start cursor at current time (in Brazil TZ) rounded up to next hour
    const now = new Date();
    const { hour: nowH, minute: nowM } = getHourMinuteInTZ(now);
    // Round up to next full hour
    const startHour = nowM > 0 ? nowH + 1 : nowH;

    // Build cursor: today in Brazil TZ at working start or current hour (whichever is later)
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
    const [ty, tm, td] = todayStr.split('-').map(Number);

    // Start at working start time today, but not before current time
    let cursor = toTZDate(ty, tm, td, startH, startM);
    if (startHour > startH || (startHour === startH && nowM > startM)) {
      cursor = toTZDate(ty, tm, td, startHour, 0);
    }

    const endDate = new Date(params.endDate);
    let iterations = 0;
    const MAX_ITERATIONS = 200;

    while (cursor < endDate && slots.length < params.maxSlots && iterations < MAX_ITERATIONS) {
      iterations++;
      const dayKey = getDayKeyInTZ(cursor);
      const { hour: cH, minute: cM } = getHourMinuteInTZ(cursor);
      const cursorMinutes = cH * 60 + cM;
      const endMinutes = endH * 60 + endM;

      if (workingDays.includes(dayKey) && cursorMinutes + durationMinutes <= endMinutes) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

        // Check for conflicts
        const slotStartMs = cursor.getTime();
        const slotEndMs = slotEnd.getTime();
        const hasConflict = busyTimes.some(b => slotStartMs < b.end && slotEndMs > b.start);

        if (!hasConflict) {
          slots.push({
            start: cursor.toISOString(),
            end: slotEnd.toISOString(),
            duration_minutes: durationMinutes,
          });
        }

        cursor = new Date(cursor.getTime() + durationMinutes * 60000);
      } else {
        // Move to next day at working start in Brazil TZ
        const nextDayStr = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-CA', { timeZone: TZ });
        const [ny, nm, nd] = nextDayStr.split('-').map(Number);
        cursor = toTZDate(ny, nm, nd, startH, startM);
      }
    }

    return slots;
  }
}

export const calendarServiceAdapter = new CalendarServiceAdapter();
