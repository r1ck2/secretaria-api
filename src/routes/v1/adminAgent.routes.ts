import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { AdminAgent } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";

const router = Router();

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
