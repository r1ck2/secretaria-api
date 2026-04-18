import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Flow } from "@/modules/flow/flow.entity";
import { ProfessionalActiveFlow } from "./professionalFlow.entity";

/**
 * GET /api/v1/professional/flows
 * Lista todos os flows visíveis para profissionais, indicando qual está ativo para o usuário logado.
 */
export async function listVisibleFlows(req: Request, res: Response) {
  try {
    const userId = req.userId as string;

    const [flows, active] = await Promise.all([
      Flow.findAll({
        where: { is_visible_to_professional: true, status: true },
        attributes: ["id", "name", "description", "status", "is_visible_to_professional", "updated_at"],
        order: [["updated_at", "DESC"]],
      }),
      ProfessionalActiveFlow.findOne({ where: { user_id: userId } }),
    ]);

    const data = flows.map(f => ({
      ...f.toJSON(),
      is_active: active?.flow_id === f.id,
    }));

    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

/**
 * PUT /api/v1/professional/flows/active
 * Define o fluxo ativo do profissional. Body: { flow_id }
 * Enviar flow_id: null para desativar.
 */
export async function setActiveFlow(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const { flow_id } = req.body;

    if (!flow_id) {
      // Desativar — remove o registro
      await ProfessionalActiveFlow.destroy({ where: { user_id: userId } });
      return res.json({ success: true, message: "Fluxo ativo removido." });
    }

    // Verifica se o flow existe e é visível
    const flow = await Flow.findOne({
      where: { id: flow_id, is_visible_to_professional: true, status: true },
    });
    if (!flow) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "Fluxo não encontrado ou não disponível." });
    }

    // Upsert — um profissional só pode ter um fluxo ativo
    const [record] = await ProfessionalActiveFlow.upsert({ user_id: userId, flow_id } as any);

    return res.json({ success: true, data: record, message: "Fluxo ativo atualizado." });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/professional/flows/active
 * Retorna o fluxo ativo do profissional logado.
 */
export async function getActiveFlow(req: Request, res: Response) {
  try {
    const userId = req.userId as string;
    const active = await ProfessionalActiveFlow.findOne({
      where: { user_id: userId },
      include: [{ model: Flow, attributes: ["id", "name", "description", "status"] }],
    });
    return res.json({ success: true, data: active ?? null });
  } catch (err: any) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: err.message });
  }
}
