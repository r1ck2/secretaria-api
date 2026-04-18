import { Log, LogLevel } from "./log.entity";
import { Op } from "sequelize";
import { Request } from "express";

export interface CreateLogData {
  level?: LogLevel;
  module: string;
  action: string;
  message: string;
  metadata?: Record<string, any>;
  user_id?: string;
  phone_number?: string;
  flow_id?: string;
  session_id?: string;
  error_stack?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface LogFilters {
  level?: LogLevel;
  module?: string;
  user_id?: string;
  phone_number?: string;
  flow_id?: string;
  session_id?: string;
  start_date?: Date;
  end_date?: Date;
  search?: string;
}

export class LogService {
  /**
   * Create a new log entry
   */
  async create(data: CreateLogData): Promise<Log> {
    return Log.create({
      level: data.level || "info",
      module: data.module,
      action: data.action,
      message: data.message,
      metadata: data.metadata || null,
      user_id: data.user_id || null,
      phone_number: data.phone_number || null,
      flow_id: data.flow_id || null,
      session_id: data.session_id || null,
      error_stack: data.error_stack || null,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
    } as any);
  }

  /**
   * Create log from Express request context
   */
  async createFromRequest(req: Request, data: Omit<CreateLogData, "ip_address" | "user_agent">): Promise<Log> {
    return this.create({
      ...data,
      ip_address: req.ip || req.connection.remoteAddress || null,
      user_agent: req.get("User-Agent") || null,
    });
  }

  /**
   * Log flow automation events
   */
  async logFlowAutomation(data: {
    level?: LogLevel;
    action: string;
    message: string;
    user_id?: string;
    phone_number?: string;
    flow_id?: string;
    session_id?: string;
    metadata?: Record<string, any>;
    error?: Error;
  }): Promise<Log> {
    const logData: CreateLogData = {
      level: data.level || "info",
      module: "flow_automation",
      action: data.action,
      message: data.message,
      user_id: data.user_id,
      phone_number: data.phone_number,
      flow_id: data.flow_id,
      session_id: data.session_id,
      metadata: {
        ...data.metadata,
        timestamp: new Date().toISOString(),
        ...(data.user_id && { professional_info: await this.getProfessionalInfo(data.user_id) }),
      },
      error_stack: data.error?.stack || null,
    };

    return this.create(logData);
  }

  /**
   * Log Evolution API events
   */
  async logEvolution(data: {
    level?: LogLevel;
    action: string;
    message: string;
    user_id?: string;
    phone_number?: string;
    metadata?: Record<string, any>;
    error?: Error;
  }): Promise<Log> {
    return this.create({
      level: data.level || "info",
      module: "evolution_api",
      action: data.action,
      message: data.message,
      user_id: data.user_id,
      phone_number: data.phone_number,
      metadata: {
        ...data.metadata,
        timestamp: new Date().toISOString(),
      },
      error_stack: data.error?.stack || null,
    });
  }

  /**
   * Get all logs with filters and pagination
   */
  async findAll(filters: LogFilters = {}, page = 1, limit = 50): Promise<{ logs: Log[]; total: number; pages: number }> {
    const where: any = { status: true };

    if (filters.level) where.level = filters.level;
    if (filters.module) where.module = filters.module;
    if (filters.user_id) where.user_id = filters.user_id;
    if (filters.phone_number) where.phone_number = { [Op.like]: `%${filters.phone_number}%` };
    if (filters.flow_id) where.flow_id = filters.flow_id;
    if (filters.session_id) where.session_id = filters.session_id;

    if (filters.start_date || filters.end_date) {
      where.created_at = {};
      if (filters.start_date) where.created_at[Op.gte] = filters.start_date;
      if (filters.end_date) where.created_at[Op.lte] = filters.end_date;
    }

    if (filters.search) {
      where[Op.or] = [
        { message: { [Op.like]: `%${filters.search}%` } },
        { action: { [Op.like]: `%${filters.search}%` } },
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await Log.findAndCountAll({
      where,
      include: [
        { model: require("@/modules/user/user.entity").User, as: "user", attributes: ["id", "name", "email"] },
        { model: require("@/modules/flow/flow.entity").Flow, as: "flow", attributes: ["id", "name"] },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    return {
      logs: rows,
      total: count,
      pages: Math.ceil(count / limit),
    };
  }

  /**
   * Get log by ID
   */
  async findById(id: string): Promise<Log | null> {
    return Log.findOne({
      where: { id, status: true },
      include: [
        { model: require("@/modules/user/user.entity").User, as: "user", attributes: ["id", "name", "email"] },
        { model: require("@/modules/flow/flow.entity").Flow, as: "flow", attributes: ["id", "name"] },
      ],
    });
  }

  /**
   * Update log
   */
  async update(id: string, data: Partial<CreateLogData>): Promise<Log | null> {
    const log = await this.findById(id);
    if (!log) return null;

    await log.update(data);
    return log;
  }

  /**
   * Soft delete log
   */
  async delete(id: string): Promise<boolean> {
    const log = await this.findById(id);
    if (!log) return false;

    await log.update({ status: false });
    return true;
  }

  /**
   * Get professional info for metadata
   */
  private async getProfessionalInfo(userId: string): Promise<Record<string, any> | null> {
    try {
      const { User } = await import("@/modules/user/user.entity");
      const user = await User.findByPk(userId, { attributes: ["id", "name", "email", "phone"] });
      return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null;
    } catch {
      return null;
    }
  }

  /**
   * Clean old logs (older than specified days)
   */
  async cleanOldLogs(daysToKeep = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Log.update(
      { status: false },
      {
        where: {
          created_at: { [Op.lt]: cutoffDate },
          status: true,
        },
      }
    );

    return result[0]; // Number of affected rows
  }
}

export const logService = new LogService();