import { Setting } from "@/modules/setting/setting.entity";
import { WhatsappConnection } from "@/modules/whatsapp/whatsapp.entity";
import { evolutionApiService } from "@/modules/evolution/evolution.service";
import { QueueJob } from "../queueJob.entity";
import { queueJobService } from "../queueJob.service";

export interface ReminderPayload {
  appointment_id: string;
  user_id: string;
  customer_phone: string;
  customer_name: string;
  appointment_title: string;
  start_at: string; // ISO
}

/**
 * Processes all due "send_appointment_reminder" jobs.
 * Called by the cron job handler when job_name === "check_reminders_appointments".
 */
export async function processSendAppointmentReminders(): Promise<void> {
  const jobs = await queueJobService.fetchDue("send_appointment_reminder", 50);

  for (const job of jobs) {
    await queueJobService.markProcessing(job.id);
    try {
      const payload = job.getPayload<ReminderPayload>();
      await sendReminder(payload);
      await queueJobService.markDone(job.id);
    } catch (err: any) {
      console.error(`[ReminderJob] Failed job ${job.id}:`, err.message);
      await queueJobService.markFailed(job.id, err.message);
    }
  }
}

async function sendReminder(payload: ReminderPayload): Promise<void> {
  const { user_id, customer_phone, customer_name, appointment_title, start_at } = payload;

  // Get professional's WhatsApp connection
  const whatsapp = await WhatsappConnection.findOne({
    where: { user_id, status: "connected" },
  });

  if (!whatsapp?.evolution_instance_name || !whatsapp?.evolution_instance_apikey) {
    throw new Error(`No connected WhatsApp instance for user ${user_id}`);
  }

  // Get professional's reminder message template (or use default)
  const settings = await Setting.findAll({ where: { user_id } });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  const companyName = map.company_name || "nossa clínica";
  const reminderTemplate = map.reminder_message_template ||
    `Olá {nome}! 👋\n\nEste é um lembrete do seu agendamento:\n\n📅 *{titulo}*\n🕐 {data_hora}\n\nEm caso de dúvidas ou necessidade de reagendamento, entre em contato conosco.\n\nAté logo! 😊`;

  const startDate = new Date(start_at);
  const formattedDate = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const message = reminderTemplate
    .replace("{nome}", customer_name || "Cliente")
    .replace("{titulo}", appointment_title)
    .replace("{data_hora}", formattedDate)
    .replace("{empresa}", companyName);

  await evolutionApiService.sendTextMessage(
    whatsapp.evolution_instance_name,
    whatsapp.evolution_instance_apikey,
    customer_phone,
    message
  );
}
