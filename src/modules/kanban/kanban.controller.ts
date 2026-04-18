import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { KanbanBoard } from "./kanban-board.entity";
import { KanbanColumn } from "./kanban-column.entity";
import { KanbanCard } from "./kanban-card.entity";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_COLUMNS = [
  { name: "Rascunhos", position: 0, color: "#94a3b8" },
  { name: "A Fazer",   position: 1, color: "#00a1d7" },
  { name: "Aguardando",position: 2, color: "#F4B400" },
  { name: "Finalizado",position: 3, color: "#4CAF50" },
];

// POST /kanban/boards/:id/init-columns
export async function initBoardColumns(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const board = await KanbanBoard.findByPk(id);
    if (!board) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Board not found." });

    const existing = await KanbanColumn.count({ where: { board_id: id } });
    if (existing > 0) return res.json({ success: true, message: "Columns already initialized." });

    const cols = DEFAULT_COLUMNS.map(c => ({ id: uuidv4(), board_id: id, ...c }));
    await KanbanColumn.bulkCreate(cols as any);

    res.status(StatusCodes.CREATED).json({ success: true, data: cols });
  } catch (err: any) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

// GET /kanban/boards/:id/full — board + columns + cards
export async function getBoardFull(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const board = await KanbanBoard.findByPk(id);
    if (!board) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Board not found." });

    const columns = await KanbanColumn.findAll({
      where: { board_id: id },
      order: [["position", "ASC"]],
    });

    const cards = await KanbanCard.findAll({
      where: { board_id: id },
      order: [["position", "ASC"]],
    });

    const columnsWithCards = columns.map(col => ({
      ...col.toJSON(),
      cards: cards.filter(c => c.column_id === col.id).map(c => c.toJSON()),
    }));

    res.json({ success: true, data: { ...board.toJSON(), columns: columnsWithCards } });
  } catch (err: any) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

// PATCH /kanban/cards/:id/move
export async function moveCard(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { column_id, position } = req.body;

    const card = await KanbanCard.findByPk(id);
    if (!card) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Card not found." });

    await card.update({ column_id, position: position ?? card.position });
    res.json({ success: true, data: card });
  } catch (err: any) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

// PATCH /kanban/columns/:id/rename
export async function renameColumn(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const col = await KanbanColumn.findByPk(id);
    if (!col) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Column not found." });
    await col.update({ name });
    res.json({ success: true, data: col });
  } catch (err: any) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}
