import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { Flow } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import {
  getFreeSlots, aiProcess, bookSlot, sendWhatsapp, createTodo,
} from "@/modules/flow/flow.mock.controller";
import {
  triggerFlow, getSession, resetSession,
} from "@/modules/flowEngine/flowEngine.controller";

const router = Router();

// ── CRUD — Admin Master only ──────────────────────────────────────────────────
router.use(
  "/flows",
  CrudMakeFactory.createRouter(Flow, {
    create: [checkjwt, requireAdminMaster],
    update: [checkjwt, requireAdminMaster],
    delete: [checkjwt, requireAdminMaster],
    findAll: [checkjwt, requireAdminMaster],
    findById: [checkjwt, requireAdminMaster],
    findOne: [checkjwt, requireAdminMaster],
  })
);

// ── Flow Engine Trigger (public — called by WhatsApp webhook or Postman) ──────
router.post("/flow/trigger", triggerFlow);
router.get("/flow/session/:phone", checkjwt, getSession);
router.delete("/flow/session/:phone", checkjwt, resetSession);

// ── Mocked flow node endpoints ────────────────────────────────────────────────
router.get("/flow/calendar/free-slots", checkjwt, getFreeSlots);
router.post("/flow/ai-process", checkjwt, aiProcess);
router.post("/flow/calendar/book", checkjwt, bookSlot);
router.post("/flow/whatsapp/send", checkjwt, sendWhatsapp);
router.post("/flow/todo/create", checkjwt, createTodo);

export default router;
