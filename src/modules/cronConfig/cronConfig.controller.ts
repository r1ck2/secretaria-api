import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Op } from "sequelize";
import { CronConfig } from "./cronConfig.entity";
import { reloadCronJobs } from "./jobs";

// GET /api/v1/cron-configs
export async function listCronConfigs(req: Request, res: Response) {
  try {
    const { parbusca = "", page = 1, limit = 20, order = "job_name", orderType = "ASC" } = req.query;

    const where: any = {};
    if (parbusca) {
      where[Op.or] = [
        { job_name: { [Op.like]: `%${parbusca}%` } },
        { description: { [Op.like]: `%${parbusca}%` } },
      ];
    }

    const total = await CronConfig.count({ where });
    const data = await CronConfig.findAll({
      where,
      order: [[String(order), String(orderType).toUpperCase()]],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
      raw: true,
    });

    return res.json({ total, current_page: Number(page), pages: Math.ceil(total / Number(limit)), data });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

// GET /api/v1/cron-configs/:id
export async function getCronConfig(req: Request, res: Response) {
  try {
    const record = await CronConfig.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Cron config not found." });
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

// POST /api/v1/cron-configs
export async function createCronConfig(req: Request, res: Response) {
  try {
    const { job_name, cron_expression, description, active } = req.body;
    if (!job_name || !cron_expression) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ success: false, message: "job_name e cron_expression são obrigatórios." });
    }
    const exists = await CronConfig.findOne({ where: { job_name } });
    if (exists) return res.status(StatusCodes.CONFLICT).json({ success: false, message: "Já existe um job com esse nome." });

    const record = await CronConfig.create({ job_name, cron_expression, description, active: active ?? false } as any);
    return res.status(StatusCodes.CREATED).json({ success: true, data: record });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

// PUT /api/v1/cron-configs/:id
export async function updateCronConfig(req: Request, res: Response) {
  try {
    const record = await CronConfig.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Cron config not found." });
    await record.update(req.body);
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

// DELETE /api/v1/cron-configs/:id
export async function deleteCronConfig(req: Request, res: Response) {
  try {
    const record = await CronConfig.findByPk(String(req.params.id));
    if (!record) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Cron config not found." });
    await record.destroy();
    return res.json({ success: true, message: "Cron config deleted." });
  } catch (err: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: err.message });
  }
}

// POST /api/v1/cron-configs/reload-jobs
export async function reloadJobsController(req: Request, res: Response) {
  try {
    await reloadCronJobs();
    return res.json({ success: true, message: "Cron jobs reloaded successfully." });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Error reloading cron jobs.", error: err.message });
  }
}
