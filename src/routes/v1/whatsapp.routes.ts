import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { WhatsappConnection } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { injectUserId } from "@/middlewares/injectUserId.middleware";

const router = Router();

router.use(
  "/whatsapp",
  CrudMakeFactory.createRouter(WhatsappConnection, {
    create: [checkjwt, injectUserId],
    update: [checkjwt],
    delete: [checkjwt],
    findAll: [checkjwt],
    findById: [checkjwt],
    findOne: [checkjwt],
  })
);

export default router;
