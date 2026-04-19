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
 * Filters internal fields, truncates history, and formats slots/appointments readably.
 */
export function serializeForOpenAI(context: SessionContext, history?: HistoryEntry[]): string {
  const parts: string[] = [];

  // Professional / company info
  const ctx = context as any;
  if (ctx.company_name) {
    parts.push(`[EMPRESA]\nNome: ${ctx.company_name}`);
  }

  // Customer info
  const customerLines: string[] = [];
  if (context.name) customerLines.push(`Nome: ${context.name}`);
  else if ((context as any).whatsapp_sender_name) customerLines.push(`Nome (WhatsApp): ${(context as any).whatsapp_sender_name}`);
  customerLines.push(`Telefone: ${context.phone}`);
  if (context.email) customerLines.push(`Email: ${context.email}`);
  customerLines.push(`Cliente recorrente: ${context.is_returning_customer ? 'Sim' : 'Não'}`);

  parts.push(`[CLIENTE]\n${customerLines.join('\n')}`);

  // Conversation state
  const convLines: string[] = [];
  convLines.push(`Saudação: ${context.time_of_day}`);
  if (context.last_user_message) {
    convLines.push(`Última mensagem: ${context.last_user_message}`);
  }
  parts.push(`[CONVERSA]\n${convLines.join('\n')}`);

  // Working hours / availability constraints
  if (ctx.working_days || ctx.working_hours_start) {
    const availLines: string[] = [];
    if (ctx.working_days && Array.isArray(ctx.working_days)) {
      availLines.push(`Dias disponíveis: ${ctx.working_days.join(', ')}`);
    }
    if (ctx.working_hours_start && ctx.working_hours_end) {
      availLines.push(`Horário: ${ctx.working_hours_start} às ${ctx.working_hours_end}`);
    }
    if (availLines.length > 0) {
      parts.push(`[DISPONIBILIDADE]\n${availLines.join('\n')}`);
    }
  }

  // Available slots
  if (context.slots && context.slots.length > 0) {
    const slotLines = context.slots.map(slot => formatSlot(slot));
    parts.push(`[HORÁRIOS DISPONÍVEIS]\n${slotLines.join('\n')}`);
  }

  // Active appointments
  if (context.appointments && context.appointments.length > 0) {
    const aptLines = context.appointments.map(apt => formatAppointment(apt));
    parts.push(`[CONSULTAS AGENDADAS]\n${aptLines.join('\n')}`);
  }

  // Pending registration
  if ((context as any).pending_registration) {
    const reg = (context as any).pending_registration;
    const regLines = Object.entries(reg)
      .filter(([k]) => k !== 'step')
      .map(([k, v]) => `${k}: ${v}`);
    if (regLines.length > 0) {
      parts.push(`[CADASTRO EM ANDAMENTO]\n${regLines.join('\n')}`);
    }
  }

  // Conversation history (truncated)
  if (history && history.length > 0) {
    const truncated = history.slice(-MAX_HISTORY_MESSAGES);
    const historyLines = truncated
      .filter(h => h.role === 'user' || h.role === 'assistant')
      .map(h => `${h.role === 'user' ? 'Cliente' : 'Assistente'}: ${h.content}`);
    if (historyLines.length > 0) {
      parts.push(`[HISTÓRICO RECENTE]\n${historyLines.join('\n')}`);
    }
  }

  return parts.join('\n\n');
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
