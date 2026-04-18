import { Router, Request, Response } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { Setting } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { injectUserId } from "@/middlewares/injectUserId.middleware";
import { StatusCodes } from "http-status-codes";

const router = Router();

/**
 * PATCH /api/v1/settings/me
 * Allows any authenticated user to upsert their own settings (key/value).
 * Used by professionals to save appointment_duration_minutes, appointment_prefix, etc.
 */
router.patch("/settings/me", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { key, value } = req.body;

    if (!key) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ success: false, message: "key is required." });
    }

    const [setting, created] = await Setting.findOrCreate({
      where: { user_id: userId, key },
      defaults: { user_id: userId, key, value } as any,
    });

    if (!created) {
      await setting.update({ value });
    }

    return res.json({ success: true, data: setting });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/settings/me
 * Returns all settings for the authenticated user.
 */
router.get("/settings/me", checkjwt, async (req: Request, res: Response) => {
  try {
    const settings = await Setting.findAll({ where: { user_id: req.userId } });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return res.json({ success: true, data: map });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/settings/admin
 * Returns all global admin settings as a key→value map.
 * MUST be registered before router.use("/settings") to avoid CrudMake intercepting it.
 */
router.get("/settings/admin", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const settings = await Setting.findAll({ where: { is_admin: true } });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return res.json({ success: true, data: map });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/settings/admin/public
 * Returns safe-to-expose global admin settings for any authenticated user.
 * Only exposes non-sensitive keys (use_admin_agent, etc.).
 */
router.get("/settings/admin/public", checkjwt, async (req: Request, res: Response) => {
  try {
    const ALLOWED_KEYS = ["use_admin_agent"];
    const settings = await Setting.findAll({
      where: { is_admin: true, key: ALLOWED_KEYS },
    });
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    return res.json({ success: true, data: map });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/v1/settings/admin
 * Upsert a global admin setting. Body: { key, value }
 * MUST be registered before router.use("/settings") to avoid CrudMake intercepting it.
 */
router.patch("/settings/admin", checkjwt, requireAdminMaster, async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ success: false, message: "key is required." });
    }

    const [setting, created] = await Setting.findOrCreate({
      where: { is_admin: true, key },
      defaults: { is_admin: true, user_id: null, key, value } as any,
    });

    if (!created) await setting.update({ value });

    return res.json({ success: true, data: setting });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

// Admin-only CRUD — registered LAST so /settings/me and /settings/admin are matched first
router.use(
  "/settings",
  CrudMakeFactory.createRouter(Setting, {
    create: [checkjwt, requireAdminMaster],
    update: [checkjwt, requireAdminMaster],
    delete: [checkjwt, requireAdminMaster],
    findAll: [checkjwt],
    findById: [checkjwt],
    findOne: [checkjwt],
  })
);

export default router;
