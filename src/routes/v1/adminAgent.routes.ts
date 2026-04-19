import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { AdminAgent } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { Request, Response } from "express";

const router = Router();

/**
 * GET /api/v1/admin-agents/available
 * Returns active admin agents visible to professionals (for agent selection).
 */
router.get("/admin-agents/available", checkjwt, async (_req: Request, res: Response) => {
  try {
    const agents = await AdminAgent.findAll({
      where: { status: true },
      attributes: ["id", "name", "model", "system_prompt", "status", "created_at"],
      order: [["name", "ASC"]],
    });
    return res.json({ success: true, data: agents });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.use(
  "/admin-agents",
  CrudMakeFactory.createRouter(AdminAgent, {
    create:   [checkjwt, requireAdminMaster],
    update:   [checkjwt, requireAdminMaster],
    delete:   [checkjwt, requireAdminMaster],
    findAll:  [checkjwt, requireAdminMaster],
    findById: [checkjwt, requireAdminMaster],
    findOne:  [checkjwt, requireAdminMaster],
  })
);

export default router;
