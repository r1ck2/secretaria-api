import { Router } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireProfessional } from "@/middlewares/authorization.middleware";
import { listBlocked, blockCustomer, unblockCustomer } from "@/modules/flowBlock/flowBlock.controller";

const router = Router();

router.get("/professional/flow-block", checkjwt, requireProfessional, listBlocked);
router.post("/professional/flow-block", checkjwt, requireProfessional, blockCustomer);
router.delete("/professional/flow-block/:phone", checkjwt, requireProfessional, unblockCustomer);

export default router;
