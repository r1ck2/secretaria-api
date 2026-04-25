import { Op } from "sequelize";
import { Appointment } from "@/modules/appointment/appointment.entity";
import { Customer } from "@/modules/customer/customer.entity";
import { Setting } from "@/modules/setting/setting.entity";
import { normalizePhoneNumber } from "@/utils/phoneNormalizer";

export interface ProfessionalAssistantResult {
  message: string;
}

/**
 * Checks if a given phone number is the professional's own registered number (secretary_phone setting).
 */
export async function isProfessionalOwnNumber(fromNumber: string, professionalUserId: string): Promise<boolean> {
  const setting = await Setting.findOne({ where: { user_id: professionalUserId, key: "secretary_phone" } });
  if (!setting?.value) return false;

  const registered = setting.value.replace(/\D/g, "");
  const incoming = fromNumber.replace(/\D/g, "");

  // Match by suffix (last 11 digits) to handle country code variations
  const normalize = (n: string) => n.slice(-11);
  return normalize(registered) === normalize(incoming);
}

/**
 * Handles a message from the professional and returns a reply.
 */
export async function handleProfessionalMessage(
  message: string,
  professionalUserId: string
): Promise<ProfessionalAssistantResult> {
  const lower = message.toLowerCase().trim();

  // ── próximos agendamentos ──────────────────────────────────────────────────
  if (
    lower.includes("próximo") ||
    lower.includes("proximo") ||
    lower.includes("agenda") ||
    lower.includes("agendamento") ||
    lower.includes("consulta") ||
    lower.includes("hoje") ||
    lower.includes("amanhã") ||
    lower.includes("amanha") ||
    lower.includes("semana")
  ) {
    return getNextAppointments(professionalUserId, lower);
  }

  // ── total de agendamentos ──────────────────────────────────────────────────
  if (
    lower.includes("total") ||
    lower.includes("quantos") ||
    lower.includes("quantidade") ||
    lower.includes("count") ||
    lower.includes("número de") ||
    lower.includes("numero de")
  ) {
    return getTotalAppointments(professionalUserId, lower);
  }

  // ── fallback ───────────────────────────────────────────────────────────────
  return {
    message:
      "Olá! 👋 Sou sua assistente virtual.\n\n" +
      "No momento consigo te ajudar com:\n\n" +
      "📅 *Próximos agendamentos* — envie \"próximos agendamentos\" ou \"agenda de hoje\"\n" +
      "📊 *Total de agendamentos* — envie \"total de agendamentos\"\n\n" +
      "Outras funcionalidades em breve! 🚀",
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function getNextAppointments(
  userId: string,
  lower: string
): Promise<ProfessionalAssistantResult> {
  const now = new Date();
  let from = now;
  let to: Date | undefined;
  let label = "próximos";

  if (lower.includes("hoje")) {
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
    label = "de hoje";
  } else if (lower.includes("amanhã") || lower.includes("amanha")) {
    from = new Date(now);
    from.setDate(from.getDate() + 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setHours(23, 59, 59, 999);
    label = "de amanhã";
  } else if (lower.includes("semana")) {
    to = new Date(now);
    to.setDate(to.getDate() + 7);
    label = "da semana";
  } else {
    to = new Date(now);
    to.setDate(to.getDate() + 7);
  }

  const where: any = {
    user_id: userId,
    status: "confirmed",
    start_at: { [Op.gte]: from, ...(to ? { [Op.lte]: to } : {}) },
  };

  const appointments = await Appointment.findAll({
    where,
    order: [["start_at", "ASC"]],
    limit: 10,
    include: [{ association: "customer", attributes: ["name", "phone"] }],
  });

  if (!appointments.length) {
    return { message: `Nenhum agendamento confirmado ${label}. 📭` };
  }

  const lines = appointments.map((a, i) => {
    const customer = (a as any).customer;
    const name = customer?.name || a.customer_phone;
    const date = new Date(a.start_at).toLocaleString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return `${i + 1}. *${name}* — ${date}`;
  });

  return {
    message:
      `📅 *Agendamentos ${label}* (${appointments.length}):\n\n` +
      lines.join("\n"),
  };
}

async function getTotalAppointments(
  userId: string,
  lower: string
): Promise<ProfessionalAssistantResult> {
  const now = new Date();

  // Total confirmed upcoming
  const upcoming = await Appointment.count({
    where: { user_id: userId, status: "confirmed", start_at: { [Op.gte]: now } },
  });

  // Total this month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const thisMonth = await Appointment.count({
    where: { user_id: userId, status: "confirmed", start_at: { [Op.between]: [monthStart, monthEnd] } },
  });

  // Total all time confirmed
  const allTime = await Appointment.count({ where: { user_id: userId, status: "confirmed" } });

  return {
    message:
      `📊 *Resumo de Agendamentos*\n\n` +
      `🔜 Próximos (confirmados): *${upcoming}*\n` +
      `📆 Este mês: *${thisMonth}*\n` +
      `✅ Total histórico: *${allTime}*`,
  };
}
