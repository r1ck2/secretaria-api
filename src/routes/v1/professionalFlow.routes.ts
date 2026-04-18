import { Router } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireProfessional } from "@/middlewares/authorization.middleware";
import { listVisibleFlows, setActiveFlow, getActiveFlow } from "@/modules/professionalFlow/professionalFlow.controller";

const router = Router();

// Todas as rotas exigem JWT + tipo professional/company
router.get("/professional/flows", checkjwt, requireProfessional, listVisibleFlows);
router.get("/professional/flows/active", checkjwt, requireProfessional, getActiveFlow);
router.put("/professional/flows/active", checkjwt, requireProfessional, setActiveFlow);

export default router;
