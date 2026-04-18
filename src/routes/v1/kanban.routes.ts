import { Router } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { KanbanBoard, KanbanColumn, KanbanCard } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { injectUserId } from "@/middlewares/injectUserId.middleware";
import {
  initBoardColumns, getBoardFull, moveCard, renameColumn,
} from "@/modules/kanban/kanban.controller";

const router = Router();

// ── Boards ────────────────────────────────────────────────────────────────────
router.use("/kanban/boards", CrudMakeFactory.createRouter(KanbanBoard, {
  create: [checkjwt, injectUserId],
  update: [checkjwt],
  delete: [checkjwt],
  findAll: [checkjwt],
  findById: [checkjwt],
  findOne: [checkjwt],
}));

// ── Columns ───────────────────────────────────────────────────────────────────
router.use("/kanban/columns", CrudMakeFactory.createRouter(KanbanColumn, {
  create: [checkjwt],
  update: [checkjwt],
  delete: [checkjwt],
  findAll: [checkjwt],
  findById: [checkjwt],
}));

// ── Cards ─────────────────────────────────────────────────────────────────────
router.use("/kanban/cards", CrudMakeFactory.createRouter(KanbanCard, {
  create: [checkjwt, injectUserId],
  update: [checkjwt],
  delete: [checkjwt],
  findAll: [checkjwt],
  findById: [checkjwt],
}));

// ── Custom endpoints ──────────────────────────────────────────────────────────
router.post("/kanban/boards/:id/init-columns", checkjwt, initBoardColumns);
router.get("/kanban/boards/:id/full", checkjwt, getBoardFull);
router.patch("/kanban/cards/:id/move", checkjwt, moveCard);
router.patch("/kanban/columns/:id/rename", checkjwt, renameColumn);

export default router;
