import { Log, LogLevel } from "./log.entity";
import { Op } from "sequelize";

export interface LogQueryOptions {
  level?: LogLevel;
  module?: string;
  user_id?: string;
  phone_number?: string;
  flow_id?: string;
  session_id?: string;
  start_date?: Date;
  end_date?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

export class LogRepository {
  /**
   * Find logs with advanced filtering
   */
  async findWithFilters(options: LogQueryOptions = {}) {
    const {
      level,
      module,
      user_id,
      phone_number,
      flow_id,
      session_id,
      start_date,
      end_date,
      search,
      page = 1,
      limit = 50,
    } = options;

    const where: any = { status: true };

    // Apply filters
    if (level) where.level = level;
    if (module) where.module = module;
    if (user_id) where.user_id = user_id;
    if (phone_number) where.phone_number = { [Op.like]: `%${phone_number}%` };
    if (flow_id) where.flow_id = flow_id;
    if (session_id) where.session_id = session_id;

    // Date range filter
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at[Op.gte] = start_date;
      if (end_date) where.created_at[Op.lte] = end_date;
    }

    // Search filter
    if (search) {
      where[Op.or] = [
        { message: { [Op.like]: `%${search}%` } },
        { action: { [Op.like]: `%${search}%` } },
        { module: { [Op.like]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;

    return Log.findAndCountAll({
      where,
      include: [
        {
          model: require("@/modules/user/user.entity").User,
          as: "user",
          attributes: ["id", "name", "email", "phone"],
          required: false,
        },
        {
          model: require("@/modules/flow/flow.entity").Flow,
          as: "flow",
          attributes: ["id", "name"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });
  }

  /**
   * Get logs by phone number (for customer support)
   */
  async findByPhoneNumber(phoneNumber: string, limit = 20) {
    return Log.findAll({
      where: {
        phone_number: { [Op.like]: `%${phoneNumber}%` },
        status: true,
      },
      include: [
        {
          model: require("@/modules/user/user.entity").User,
          as: "user",
          attributes: ["id", "name", "email"],
          required: false,
        },
        {
          model: require("@/modules/flow/flow.entity").Flow,
          as: "flow",
          attributes: ["id", "name"],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
      limit,
    });
  }

  /**
   * Get logs by session ID (for flow debugging)
   */
  async findBySessionId(sessionId: string) {
    return Log.findAll({
      where: {
        session_id: sessionId,
        status: true,
      },
      include: [
        {
          model: require("@/modules/user/user.entity").User,
          as: "user",
          attributes: ["id", "name", "email"],
          required: false,
        },
        {
          model: require("@/modules/flow/flow.entity").Flow,
          as: "flow",
          attributes: ["id", "name"],
          required: false,
        },
      ],
      order: [["created_at", "ASC"]], // Chronological order for session flow
    });
  }

  /**
   * Get error logs summary
   */
  async getErrorSummary(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return Log.findAll({
      where: {
        level: "error",
        created_at: { [Op.gte]: startDate },
        status: true,
      },
      attributes: [
        "module",
        "action",
        [require("sequelize").fn("COUNT", "*"), "count"],
      ],
      group: ["module", "action"],
      order: [[require("sequelize").literal("count"), "DESC"]],
    });
  }

  /**
   * Get logs statistics
   */
  async getStatistics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalLogs, errorLogs, warningLogs, moduleStats] = await Promise.all([
      Log.count({
        where: {
          created_at: { [Op.gte]: startDate },
          status: true,
        },
      }),
      Log.count({
        where: {
          level: "error",
          created_at: { [Op.gte]: startDate },
          status: true,
        },
      }),
      Log.count({
        where: {
          level: "warn",
          created_at: { [Op.gte]: startDate },
          status: true,
        },
      }),
      Log.findAll({
        where: {
          created_at: { [Op.gte]: startDate },
          status: true,
        },
        attributes: [
          "module",
          [require("sequelize").fn("COUNT", "*"), "count"],
        ],
        group: ["module"],
        order: [[require("sequelize").literal("count"), "DESC"]],
        limit: 10,
      }),
    ]);

    return {
      totalLogs,
      errorLogs,
      warningLogs,
      moduleStats,
      period: `${days} days`,
    };
  }
}

export const logRepository = new LogRepository();