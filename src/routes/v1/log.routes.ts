import { Router } from "express";
import { Log } from "@/modules/log/log.entity";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { logController } from "@/modules/log/log.controller";

const router = Router();

// ── Custom Routes (must come BEFORE CRUD routes to avoid conflicts) ──────────

/**
 * GET /api/v1/logs/phone/:phoneNumber
 * Get logs by phone number (for customer support)
 */
router.get("/logs/phone/:phoneNumber", checkjwt, requireAdminMaster, logController.getLogsByPhone.bind(logController));

/**
 * GET /api/v1/logs/session/:sessionId
 * Get logs by session ID (for flow debugging)
 */
router.get("/logs/session/:sessionId", checkjwt, requireAdminMaster, logController.getLogsBySession.bind(logController));

/**
 * GET /api/v1/logs/errors/summary
 * Get error logs summary
 */
router.get("/logs/errors/summary", checkjwt, requireAdminMaster, logController.getErrorSummary.bind(logController));

/**
 * GET /api/v1/logs/statistics
 * Get logs statistics
 */
router.get("/logs/statistics", checkjwt, requireAdminMaster, logController.getStatistics.bind(logController));

/**
 * POST /api/v1/logs/search
 * Advanced log search with filters
 */
router.post("/logs/search", checkjwt, requireAdminMaster, logController.searchLogs.bind(logController));

/**
 * DELETE /api/v1/logs/all
 * Delete all logs (admin only)
 */
router.delete("/logs/all", checkjwt, requireAdminMaster, logController.deleteAllLogs.bind(logController));

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

export default router;