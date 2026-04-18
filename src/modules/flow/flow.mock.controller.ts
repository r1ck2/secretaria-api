import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

// Mock: GET /api/v1/flow/calendar/free-slots
export function getFreeSlots(_req: Request, res: Response) {
  const base = new Date();
  base.setHours(9, 0, 0, 0);

  const slots = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(base);
    start.setDate(start.getDate() + Math.floor(i / 2));
    start.setHours(9 + (i % 2) * 2);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  });

  res.json({ success: true, data: slots });
}

// Mock: POST /api/v1/flow/ai-process
export function aiProcess(req: Request, res: Response) {
  const { message = "" } = req.body;
  const intent = message.toLowerCase().includes("agendar") ? "schedule" : "general";
  res.json({
    success: true,
    data: {
      intent,
      response: `[Mock AI] Entendi sua mensagem: "${message}". Intenção detectada: ${intent}.`,
      confidence: 0.92,
    },
  });
}

// Mock: POST /api/v1/flow/calendar/book
export function bookSlot(req: Request, res: Response) {
  const { start, end, title } = req.body;
  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {
      event_id: `mock_event_${Date.now()}`,
      title: title || "Consulta",
      start,
      end,
      status: "confirmed",
    },
  });
}

// Mock: POST /api/v1/flow/whatsapp/send
export function sendWhatsapp(req: Request, res: Response) {
  const { to, message } = req.body;
  res.json({
    success: true,
    data: {
      message_id: `mock_msg_${Date.now()}`,
      to,
      message,
      status: "sent",
    },
  });
}

// Mock: POST /api/v1/flow/todo/create
export function createTodo(req: Request, res: Response) {
  const { title, description, priority = "medium" } = req.body;
  res.status(StatusCodes.CREATED).json({
    success: true,
    data: {
      id: `mock_todo_${Date.now()}`,
      title,
      description,
      priority,
      status: "pending",
      created_at: new Date().toISOString(),
    },
  });
}
