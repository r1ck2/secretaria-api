import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { queueJobService } from "./queueJob.service";
import { QueueJob } from "./queueJob.entity";

export async function listQueueJobs(req: Request, res: Response) {
  try {
    const { page = 1, limit = 20, status, job_type } = req.query;
    const result = await queueJobService.list({
      page: Number(page),
      limit: Number(limit),
      status: status as string,
      job_type: job_type as string,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

export async function getQueueJob(req: Request, res: Response) {
  try {
    const record = await QueueJob.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Job not found." });
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

export async function deleteQueueJob(req: Request, res: Response) {
  try {
    const record = await QueueJob.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Job not found." });
    await record.destroy();
    return res.json({ success: true, message: "Job deleted." });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

export async function retryQueueJob(req: Request, res: Response) {
  try {
    const record = await QueueJob.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Job not found." });
    await record.update({ status: "pending", error_message: null, processed_at: null });
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}
