import { Router, Request, Response, NextFunction } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { Customer } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { injectUserId } from "@/middlewares/injectUserId.middleware";

const router = Router();

// Strip non-numeric chars from document before create/update
const sanitizeDocument = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body?.document) {
    req.body.document = req.body.document.replace(/\D/g, "");
  }
  next();
};

router.use(
  "/customers",
  CrudMakeFactory.createRouter(Customer, {
    create: [checkjwt, injectUserId, sanitizeDocument],
    update: [checkjwt, sanitizeDocument],
    delete: [checkjwt],
    findAll: [checkjwt],
    findById: [checkjwt],
    findOne: [checkjwt],
  })
);

export default router;
