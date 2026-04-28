/**
 * In-memory deduplication for professional assistant echo messages.
 *
 * When the AI sends a response to the professional's own WhatsApp number,
 * Evolution API fires a second MESSAGES_UPSERT webhook for that delivery
 * (fromMe: false). We register the sent text here BEFORE calling sendTextMessage
 * so the echo check in triggerFlowEvolution can drop it without a DB lookup.
 */

const recentlySent = new Map<string, number>();
const ECHO_TTL_MS = 10_000; // 10 seconds

function makeKey(phone: string, text: string): string {
  return `${phone.replace(/\D/g, "")}:${text.trim()}`;
}

/**
 * Register a message that was just sent to the professional's number.
 * Call this BEFORE invoking evolutionApiService.sendTextMessage.
 */
export function markSentToProfessional(phone: string, text: string): void {
  recentlySent.set(makeKey(phone, text), Date.now());
  // Prune stale entries
  const cutoff = Date.now() - ECHO_TTL_MS;
  for (const [k, ts] of recentlySent) {
    if (ts < cutoff) recentlySent.delete(k);
  }
}

/**
 * Returns true if this incoming message is an echo of a recently sent AI response.
 * Consumes the entry so the same text can be sent again later.
 */
export function isEchoFromProfessional(phone: string, text: string): boolean {
  const key = makeKey(phone, text);
  const ts = recentlySent.get(key);
  if (!ts) return false;
  if (Date.now() - ts > ECHO_TTL_MS) {
    recentlySent.delete(key);
    return false;
  }
  recentlySent.delete(key); // consume — one echo per send
  return true;
}
