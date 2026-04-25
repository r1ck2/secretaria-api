import { Setting } from "@/modules/setting/setting.entity";
import { queueJobService } from "../queueJob.service";
import { ReminderPayload } from "../handlers/sendAppointmentReminder.handler";

/**
 * Enqueues a reminder job for an appointment.
 * Reads the professional's `reminder_hours_before` setting to compute scheduled_at.
 * If the setting is 0 or not set, no reminder is enqueued.
 */
export async function enqueueAppointmentReminder(params: {
  appointment_id: string;
  user_id: string;
  customer_phone: string;
  customer_name: string;
  appointment_title: string;
  start_at: Date | string;
}): Promise<void> {
  try {
    const settings = await Setting.findAll({ where: { user_id: params.user_id } });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const hoursBeforeRaw = map.reminder_hours_before;
    if (!hoursBeforeRaw) return; // no reminder configured

    const hoursBefore = parseFloat(hoursBeforeRaw);
    if (!hoursBefore || hoursBefore <= 0) return;

    const startAt = new Date(params.start_at);
    const scheduledAt = new Date(startAt.getTime() - hoursBefore * 60 * 60 * 1000);

    // Don't schedule if the reminder time is already in the past
    if (scheduledAt <= new Date()) return;

    const payload: ReminderPayload = {
      appointment_id: params.appointment_id,
      user_id: params.user_id,
      customer_phone: params.customer_phone,
      customer_name: params.customer_name,
      appointment_title: params.appointment_title,
      start_at: startAt.toISOString(),
    };

    await queueJobService.enqueue({
      job_type: "send_appointment_reminder",
      payload,
      scheduled_at: scheduledAt,
    });

    console.log(`[Queue] Reminder enqueued for appointment ${params.appointment_id} at ${scheduledAt.toISOString()}`);
  } catch (err: any) {
    // Non-fatal — log but don't break the booking flow
    console.error("[Queue] Failed to enqueue reminder:", err.message);
  }
}
