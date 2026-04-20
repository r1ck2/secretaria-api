import { CalendarService } from '@/modules/calendar/calendar.service';

/**
 * Adapts CalendarService to the interface expected by AI Orchestrator tools.
 * Tools call: createEvent({ userId, title, description, start, end, attendees })
 * CalendarService expects: createEvent(userId, { summary, description, start_date_time, end_date_time })
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
  }): Promise<{ start: string; end: string; duration_minutes: number }[]> {
    const DAY_MAP: Record<number, string> = { 1: 'seg', 2: 'ter', 3: 'qua', 4: 'qui', 5: 'sex', 6: 'sab', 0: 'dom' };
    const workingDays = params.workingDays || ['seg', 'ter', 'qua', 'qui', 'sex'];
    const [startH, startM] = (params.workingHoursStart || '09:00').split(':').map(Number);
    const [endH, endM] = (params.workingHoursEnd || '18:00').split(':').map(Number);
    const durationMinutes = 60;

    // Fetch existing events to avoid conflicts
    let busyTimes: { start: string; end: string }[] = [];
    try {
      const events = await this.service.listEvents(params.userId, params.startDate, params.endDate);
      busyTimes = events
        .filter((e: any) => e.start?.dateTime && e.end?.dateTime)
        .map((e: any) => ({ start: e.start.dateTime, end: e.end.dateTime }));
    } catch {
      // If calendar not connected, return slots without conflict check
    }

    const slots: { start: string; end: string; duration_minutes: number }[] = [];
    const cursor = new Date(params.startDate);
    cursor.setHours(startH, startM, 0, 0);

    // If current time is past start, advance to next hour
    if (cursor <= new Date()) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    }

    const endDate = new Date(params.endDate);

    while (cursor < endDate && slots.length < params.maxSlots) {
      const dayKey = DAY_MAP[cursor.getDay()];
      const cursorMinutes = cursor.getHours() * 60 + cursor.getMinutes();
      const endMinutes = endH * 60 + endM;

      if (workingDays.includes(dayKey) && cursorMinutes + durationMinutes <= endMinutes) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);

        // Check for conflicts with existing calendar events
        const hasConflict = busyTimes.some(busy => {
          const busyStart = new Date(busy.start).getTime();
          const busyEnd = new Date(busy.end).getTime();
          const slotStart = cursor.getTime();
          const slotEndTime = slotEnd.getTime();
          return slotStart < busyEnd && slotEndTime > busyStart;
        });

        if (!hasConflict) {
          slots.push({
            start: cursor.toISOString(),
            end: slotEnd.toISOString(),
            duration_minutes: durationMinutes,
          });
        }

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

export const calendarServiceAdapter = new CalendarServiceAdapter();
