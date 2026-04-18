import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { FlowBlockedCustomer } from "./flowBlock.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { Op } from "sequelize";

const normalize = (phone: string) => phone.replace(/\D/g, "");

/**
 * GET /api/v1/professional/flow-block
 * Lista todos os clientes bloqueados do profissional logado.
 * Enriquece com dados do cliente (nome) quando disponível.
 */
export async function listBlocked(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const { parbusca = "", page = 1, limit = 20 } = req.query;

    const where: any = { user_id: userId };
    if (parbusca) {
      where.phone = { [Op.like]: `%${String(parbusca).replace(/\D/g, "")}%` };
    }

    const { count, rows } = await FlowBlockedCustomer.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    // Enrich with customer name
    const phones = rows.map(r => r.phone);
    const customers = phones.length
      ? await Customer.findAll({ where: { user_id: userId, phone: { [Op.in]: phones } } })
      : [];

    const customerMap = Object.fromEntries(customers.map(c => [normalize(c.phone), c]));

    const data = rows.map(r => ({
      ...r.toJSON(),
      customer_name: customerMap[r.phone]?.name ?? null,
      customer_email: customerMap[r.phone]?.email ?? null,
    }));

    return res.json({
      success: true,
      data,
      pagination: { page: Number(page), limit: Number(limit), total: count, totalPages: Math.ceil(count / Number(limit)) },
    });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/professional/flow-block
 * Bloqueia um número. Body: { phone, reason? }
 */
export async function blockCustomer(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const { phone, reason } = req.body;

    if (!phone) {
      return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ success: false, message: "phone é obrigatório." });
    }

    const normalizedPhone = normalize(String(phone));

    const [record, created] = await FlowBlockedCustomer.findOrCreate({
      where: { user_id: userId, phone: normalizedPhone },
      defaults: { user_id: userId, phone: normalizedPhone, reason: reason || null } as any,
    });

    if (!created && reason !== undefined) {
      await record.update({ reason: reason || null });
    }

    return res.status(created ? StatusCodes.CREATED : StatusCodes.OK).json({
      success: true,
      data: record,
      message: created ? "Cliente bloqueado do fluxo." : "Registro já existia — motivo atualizado.",
    });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/v1/professional/flow-block/:phone
 * Remove o bloqueio de um número (reativa o flow para o cliente).
 */
export async function unblockCustomer(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const normalizedPhone = normalize(req.params.phone);

    const deleted = await FlowBlockedCustomer.destroy({
      where: { user_id: userId, phone: normalizedPhone },
    });

    if (!deleted) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Bloqueio não encontrado." });
    }

    return res.json({ success: true, message: "Bloqueio removido. Flow reativado para este cliente." });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}
