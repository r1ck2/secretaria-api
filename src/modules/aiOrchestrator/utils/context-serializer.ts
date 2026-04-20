import { SessionContext, HistoryEntry, Slot, AppointmentSummary } from '../types';

// Fields that should NOT be sent to OpenAI (internal/technical)
const INTERNAL_FIELDS = new Set([
  'session_id',
  'flow_id',
  '_reexecute_node',
  '_flow_state',
  '_internal',
  'customer_id', // internal DB id, not useful for AI
]);

const MAX_HISTORY_MESSAGES = 10;

export interface SerializedContext {
  customer: {
    name?: string;
    phone: string;
    email?: string;
    is_returning_customer: boolean;
  };
  conversation: {
    time_of_day: string;
    last_user_message: string;
    stage?: string;
  };
  available_slots?: string[];
  active_appointments?: string[];
  pending_registration?: Record<string, string>;
}

/**
 * Serializes SessionContext into a concise string for OpenAI system prompt injection.
 */
export function serializeForOpenAI(context: SessionContext, history?: HistoryEntry[]): string {
  const parts: string[] = [];
  const ctx = context as any;

  // Current date/time — critical so AI uses the correct year when parsing dates
  const now = new Date();
  const currentDateStr = now.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const currentTimeStr = now.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
  parts.push(`[DATA E HORA ATUAL]\n${currentDateStr} às ${currentTimeStr}\nAno atual: ${now.getFullYear()}\nINSTRUÇÃO: Ao interpretar datas mencionadas pelo cliente (ex: "dia 28", "próxima segunda"), use SEMPRE o ano ${now.getFullYear()} como referência.`);

  // Company info
  if (ctx.company_name) {
    parts.push(`[EMPRESA]\nNome: ${ctx.company_name}`);
  }

  // Customer info
  const customerLines: string[] = [];
  if (context.name) customerLines.push(`Nome: ${context.name}`);
  else if (ctx.whatsapp_sender_name) customerLines.push(`Nome (WhatsApp): ${ctx.whatsapp_sender_name}`);
  customerLines.push(`Telefone: ${context.phone}`);
  if (context.email) customerLines.push(`Email: ${context.email}`);
  customerLines.push(`Cliente cadastrado: ${context.is_returning_customer ? 'Sim' : 'Não'}`);
  if (context.customer_id) customerLines.push(`ID: ${context.customer_id}`);
  parts.push(`[CLIENTE]\n${customerLines.join('\n')}`);

  // Conversation state — explicit stage tracking
  const convLines: string[] = [];
  convLines.push(`Horário: ${context.time_of_day}`);
  if (context.last_user_message) convLines.push(`Última mensagem do cliente: "${context.last_user_message}"`);

  // Determine current stage
  const stage = deriveStage(context, history);
  convLines.push(`Estágio atual: ${stage}`);
  parts.push(`[CONVERSA]\n${convLines.join('\n')}`);

  // Working hours
  if (ctx.working_days || ctx.working_hours_start) {
    const lines: string[] = [];
    if (ctx.working_days && Array.isArray(ctx.working_days)) lines.push(`Dias: ${ctx.working_days.join(', ')}`);
    if (ctx.working_hours_start && ctx.working_hours_end) lines.push(`Horário: ${ctx.working_hours_start} às ${ctx.working_hours_end}`);
    if (lines.length) parts.push(`[DISPONIBILIDADE DO PROFISSIONAL]\n${lines.join('\n')}`);
  }

  // Available slots — critical for slot selection flow
  if (context.slots && context.slots.length > 0) {
    const slotLines = context.slots.map(slot => formatSlot(slot));
    parts.push(`[HORÁRIOS DISPONÍVEIS — aguardando escolha do cliente]\n${slotLines.join('\n')}\nINSTRUÇÃO: Se o cliente responder com número (1-${context.slots.length}), interprete como escolha deste slot.`);
  }

  // Pending slot confirmation
  if (ctx.pending_slot_confirmation) {
    const s = ctx.pending_slot_confirmation;
    parts.push(`[AGUARDANDO CONFIRMAÇÃO]\nSlot escolhido: ${s.label}\nINSTRUÇÃO: Se cliente responder "sim" ou confirmar, chame book_appointment com slot_index=${s.index}. Se responder "não", liste os horários novamente.`);
  }

  // Active appointments
  if (context.appointments && context.appointments.length > 0) {
    const aptLines = context.appointments.map(apt => formatAppointment(apt));
    parts.push(`[CONSULTAS AGENDADAS DO CLIENTE]\n${aptLines.join('\n')}`);
  }

  // Last booked appointment (just confirmed)
  if (ctx.last_booked_appointment) {
    parts.push(`[ÚLTIMO AGENDAMENTO REALIZADO]\n${ctx.last_booked_appointment}`);
  }

  // Pending registration
  if (ctx.pending_registration) {
    const reg = ctx.pending_registration;
    const regLines = Object.entries(reg).filter(([k]) => k !== 'step').map(([k, v]) => `${k}: ${v}`);
    if (regLines.length) parts.push(`[CADASTRO EM ANDAMENTO]\n${regLines.join('\n')}\nEtapa atual: ${reg.step}`);
  }

  // Conversation history
  if (history && history.length > 0) {
    const truncated = history.slice(-MAX_HISTORY_MESSAGES);
    const historyLines = truncated
      .filter(h => h.role === 'user' || h.role === 'assistant')
      .map(h => `${h.role === 'user' ? 'Cliente' : 'Assistente'}: ${h.content}`);
    if (historyLines.length) parts.push(`[HISTÓRICO RECENTE]\n${historyLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Derives the current conversation stage based on context and history.
 */
function deriveStage(context: SessionContext, history?: HistoryEntry[]): string {
  const ctx = context as any;
  const msgCount = history?.filter(h => h.role === 'user' || h.role === 'assistant').length ?? 0;

  if (msgCount <= 1) return 'BOAS-VINDAS — primeira interação, cumprimente e pergunte como pode ajudar';
  if (!context.is_returning_customer && !context.customer_id) return 'IDENTIFICAÇÃO — cliente não cadastrado, colete o nome';
  if (ctx.pending_slot_confirmation) return 'CONFIRMAÇÃO — aguardando cliente confirmar o slot escolhido com "sim" ou "não"';
  if (context.slots && context.slots.length > 0) return 'LISTAGEM — horários já foram listados, aguardando cliente escolher um número (1-' + context.slots.length + ')';
  if (ctx.last_booked_appointment) return 'PÓS-AGENDAMENTO — agendamento realizado, ofereça mais ajuda';
  return 'ATENDIMENTO — aguardando intenção do cliente';
}

function formatSlot(slot: Slot): string {
  return `  ${slot.index}. ${slot.label} (${slot.duration_minutes} min)`;
}

function formatAppointment(apt: AppointmentSummary): string {
  return `  - ${apt.label}: ${apt.title} [id: ${apt.id}]`;
}

/**
 * Filters a context object removing internal-only fields before any serialization.
 */
export function filterInternalFields(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => !INTERNAL_FIELDS.has(key))
  );
}

/**
 * Truncates history array to the last N messages.
 */
export function truncateHistory(history: HistoryEntry[], maxMessages = MAX_HISTORY_MESSAGES): HistoryEntry[] {
  if (history.length <= maxMessages) return history;
  return history.slice(-maxMessages);
}
