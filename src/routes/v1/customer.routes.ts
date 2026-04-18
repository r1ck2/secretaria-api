import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { Customer } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { injectUserId } from "@/middlewares/injectUserId.middleware";

const router = Router();

router.use(
  "/customers",
  CrudMakeFactory.createRouter(Customer, {
    create: [checkjwt, injectUserId],
    update: [checkjwt],
    delete: [checkjwt],
    findAll: [checkjwt],
    findById: [checkjwt],
    findOne: [checkjwt],
  })
);

export default router;
