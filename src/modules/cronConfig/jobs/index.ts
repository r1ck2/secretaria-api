import { scheduleJob, scheduledJobs } from "node-schedule";
import { CronConfig } from "../cronConfig.entity";
import { processSendAppointmentReminders } from "@/modules/queueJob/handlers/sendAppointmentReminder.handler";
import { closeInactiveSessions } from "@/modules/flowEngine/jobs/closeInactiveSessions.handler";

const activeJobs: Record<string, any> = {};

const clearAllJobs = () => {
  Object.keys(scheduledJobs).forEach((name) => scheduledJobs[name].cancel());
  Object.keys(activeJobs).forEach((name) => delete activeJobs[name]);
};

/**
 * Register a handler for a given job_name.
 * Add new job handlers here as the platform grows.
 */
const getJobHandler = (job_name: string): (() => Promise<void>) | null => {
  const handlers: Record<string, () => Promise<void>> = {
    check_reminders_appointments: processSendAppointmentReminders,
    close_inactive_sessions_flow: closeInactiveSessions,
  };
  return handlers[job_name] ?? null;
};

export const setupCronJobs = async () => {
  if (process.env.STOP_JOBS === "true") {
    console.log("Cron jobs disabled via STOP_JOBS env.");
    return;
  }

  try {
    clearAllJobs();

    const configs = await CronConfig.findAll({ where: { active: true } });

    if (!configs.length) {
      console.log("No active cron configs found.");
      return;
    }

    configs.forEach((config) => {
      const { job_name, cron_expression } = config;
      const handler = getJobHandler(job_name);

      if (!handler) {
        console.warn(`No handler registered for job: ${job_name}`);
        return;
      }

      activeJobs[job_name] = scheduleJob(cron_expression, async () => {
        console.log(`[CronJob] Running ${job_name} — ${new Date().toISOString()}`);
        await handler();
      });
    });
  } catch (error) {
    console.error("Error setting up cron jobs:", error);
  } finally {
    console.log("Cron jobs setup complete 🟢");
  }
};

export const reloadCronJobs = async () => {
  console.log("Reloading cron jobs...");
  await setupCronJobs();
};

export { clearAllJobs };
export default setupCronJobs;
