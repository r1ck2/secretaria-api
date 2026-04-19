import { Router, Request, Response } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { Appointment } from "@/entities";
import { Customer } from "@/modules/customer/customer.entity";
import { Op } from "sequelize";

const router = Router();

/**
 * GET /api/v1/appointments
 * Returns appointments for the authenticated professional.
 * Query params: status, from (ISO date), to (ISO date)
 */
router.get("/appointments", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { status, from, to } = req.query;

    const where: any = { user_id: userId };
    if (status) where.status = status;
    if (from || to) {
      where.start_at = {};
      if (from) where.start_at[Op.gte] = new Date(from as string);
      if (to) where.start_at[Op.lte] = new Date(to as string);
    }

    const appointments = await Appointment.findAll({
      where,
      order: [["start_at", "ASC"]],
      include: [{ association: "customer", attributes: ["id", "name", "phone", "email"] }],
    });

    return res.json({ success: true, data: appointments });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/v1/appointments/:id/status
 * Update appointment status (confirmed/cancelled).
 */
router.patch("/appointments/:id/status", checkjwt, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.userId!;

    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido." });
    }

    const appointment = await Appointment.findOne({ where: { id, user_id: userId } });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Agendamento não encontrado." });
    }

    await appointment.update({ status });
    return res.json({ success: true, data: appointment });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
