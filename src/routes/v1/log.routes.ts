import { Router } from "express";
import { Log } from "@/modules/log/log.entity";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { logRepository } from "@/modules/log/log.repository";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

const router = Router();

// ── CRUD Routes using CrudMakeFactory ────────────────────────────────────────
router.use(
  "/logs",
  CrudMakeFactory.createRouter(Log, {
    create: [checkjwt, requireAdminMaster],
    update: [checkjwt, requireAdminMaster],
    findAll: [checkjwt, requireAdminMaster],
    findOne: [checkjwt, requireAdminMaster],
    findById: [checkjwt, requireAdminMaster],
    delete: [checkjwt, requireAdminMaster],
  })
);

// ── Custom Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/logs/phone/:phoneNumber
 * Get logs by phone number (for customer support)
 */
router.get("/logs/phone/:phoneNumber", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const logs = await logRepository.findByPhoneNumber(phoneNumber, limit);

    return res.json({
      success: true,
      data: logs,
      total: logs.length,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error fetching logs by phone number.",
    });
  }
});

/**
 * GET /api/v1/logs/session/:sessionId
 * Get logs by session ID (for flow debugging)
 */
router.get("/logs/session/:sessionId", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const logs = await logRepository.findBySessionId(sessionId);

    return res.json({
      success: true,
      data: logs,
      total: logs.length,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error fetching logs by session ID.",
    });
  }
});

/**
 * GET /api/v1/logs/errors/summary
 * Get error logs summary
 */
router.get("/logs/errors/summary", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const summary = await logRepository.getErrorSummary(days);

    return res.json({
      success: true,
      data: summary,
      period: `${days} days`,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error fetching error summary.",
    });
  }
});

/**
 * GET /api/v1/logs/statistics
 * Get logs statistics
 */
router.get("/logs/statistics", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const stats = await logRepository.getStatistics(days);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error fetching statistics.",
    });
  }
});

/**
 * POST /api/v1/logs/search
 * Advanced log search with filters
 */
router.post("/logs/search", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
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
    } = req.body;

    const options = {
      level,
      module,
      user_id,
      phone_number,
      flow_id,
      session_id,
      start_date: start_date ? new Date(start_date) : undefined,
      end_date: end_date ? new Date(end_date) : undefined,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await logRepository.findWithFilters(options);

    return res.json({
      success: true,
      data: result.rows,
      total: result.count,
      pages: Math.ceil(result.count / options.limit),
      currentPage: options.page,
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error searching logs.",
    });
  }
});

/**
 * DELETE /api/v1/logs/all
 * Delete all logs (admin only)
 */
router.delete("/logs/all", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== "DELETE_ALL_LOGS") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Confirmation required. Send { confirm: 'DELETE_ALL_LOGS' } in request body.",
      });
    }

    // Soft delete all logs by setting status to false
    const result = await Log.update(
      { status: false },
      { where: { status: true } }
    );

    return res.json({
      success: true,
      message: `${result[0]} logs deleted successfully.`,
      deleted_count: result[0],
    });
  } catch (error: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || "Error deleting all logs.",
    });
  }
});

export default router;