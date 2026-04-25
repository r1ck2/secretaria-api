import { Op } from "sequelize";
import { QueueJob, QueueJobStatus } from "./queueJob.entity";
import { v4 as uuidv4 } from "uuid";

export interface EnqueueOptions {
  job_type: string;
  payload?: Record<string, any>;
  /** ISO string or Date — when null the job runs on next cycle */
  scheduled_at?: Date | string | null;
}

export class QueueJobService {
  async enqueue(opts: EnqueueOptions): Promise<QueueJob> {
    return QueueJob.create({
      id: uuidv4(),
      job_type: opts.job_type,
      status: "pending",
      payload: JSON.stringify(opts.payload || {}),
      scheduled_at: opts.scheduled_at ? new Date(opts.scheduled_at) : null,
    } as any);
  }

  /** Fetch jobs that are due and still pending */
  async fetchDue(job_type?: string, limit = 50): Promise<QueueJob[]> {
    const where: any = {
      status: "pending",
      [Op.or]: [
        { scheduled_at: null },
        { scheduled_at: { [Op.lte]: new Date() } },
      ],
    };
    if (job_type) where.job_type = job_type;
    return QueueJob.findAll({ where, order: [["scheduled_at", "ASC"]], limit });
  }

  async markProcessing(id: string): Promise<void> {
    await QueueJob.update({ status: "processing" }, { where: { id } });
  }

  async markDone(id: string): Promise<void> {
    await QueueJob.update({ status: "done", processed_at: new Date() }, { where: { id } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await QueueJob.update(
      { status: "failed", error_message: error, processed_at: new Date() },
      { where: { id } }
    );
  }

  async list(params: { page?: number; limit?: number; status?: string; job_type?: string }) {
    const { page = 1, limit = 20, status, job_type } = params;
    const where: any = {};
    if (status) where.status = status;
    if (job_type) where.job_type = job_type;

    const total = await QueueJob.count({ where });
    const data = await QueueJob.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      raw: true,
    });
    return { total, current_page: page, pages: Math.ceil(total / limit), data };
  }
}

export const queueJobService = new QueueJobService();
