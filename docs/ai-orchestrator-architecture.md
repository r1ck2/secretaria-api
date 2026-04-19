# AI Orchestrator — Architecture

## Overview

The AI Orchestrator replaces the rigid node-based FlowEngine with a fully AI-driven conversation loop powered by OpenAI Tool Calling. The professional's agent receives every WhatsApp message, decides what to do (schedule, cancel, register, create todo), and calls the appropriate tool — all in a single round-trip.

```
WhatsApp → Evolution API → Webhook → AIOrchestrator.receiveMessage()
                                          │
                          ┌───────────────┼───────────────────┐
                          ▼               ▼                   ▼
                   SessionManager    OpenAIClient         ToolExecutor
                   (find/create)     (chat + tools)       (route calls)
                          │               │                   │
                          └───────────────┴───────────────────┘
                                          │
                                   EvolutionApiService
                                   (send WhatsApp reply)
```

## Components

### `ai-orchestrator.service.ts`
Main entry point. Orchestrates the full flow:
1. Normalize phone, check blocked customers
2. Find or create `FlowSession`
3. Enrich context (customer data, appointments)
4. Select agent (admin or professional)
5. Serialize context → system prompt
6. Call OpenAI with tool definitions
7. Execute tool calls, update context
8. Send reply via WhatsApp

### `session-manager.ts`
Manages `mv_flow_sessions`. Provides:
- `findOrCreateSession()` — phone + flow scoped lookup
- `enrichContext()` — adds customer name, appointments, time_of_day
- `updateContext()` / `pushMessage()` — state persistence

### `openai.client.ts`
Wraps OpenAI Chat Completions API with:
- Retry + exponential backoff (3 attempts)
- Tool definitions passed as `tools` parameter
- `parseResponse()` — extracts `output_text` and `tool_calls`

### `tools/tool-executor.ts`
Routes tool calls to implementations:

| Tool | Description |
|------|-------------|
| `list_slots` | Fetches available calendar slots (next 7 days, up to 4) |
| `book_appointment` | Creates Google Calendar event + `mv_appointments` record |
| `cancel_appointment` | Deletes calendar event + sets status = 'cancelled' |
| `register_customer` | Creates `cad_customers` record |
| `create_todo` | Creates Kanban card in `cfg_kanban_cards` |

### `utils/context-serializer.ts`
Formats `SessionContext` into a concise string injected into the system prompt. Filters internal fields (`flow_id`, `session_id`, etc.), truncates history to last 10 messages, formats slots as numbered list.

### `utils/phone-normalizer.ts`
Strips all non-numeric characters from phone numbers for consistent DB lookups.

## Data Flow

```
receiveMessage(phoneNumber, message, flowId, professionalUserId)
  │
  ├─ normalizePhone()
  ├─ isCustomerBlocked() → early return if blocked
  ├─ SessionManager.findOrCreateSession()
  ├─ SessionManager.pushMessage(role='user')
  ├─ SessionManager.enrichContext()
  ├─ selectAgent()  ← checks use_admin_agent setting
  ├─ serializeForOpenAI(context, history)
  ├─ OpenAIClient.createResponse(systemPrompt, history, tools)
  ├─ parseResponse() → { output_text, tool_calls }
  ├─ processToolCalls() → ToolExecutor.executeTool() × N
  ├─ SessionManager.updateContext()
  ├─ EvolutionApiService.sendTextMessage()
  └─ SessionManager.pushMessage(role='assistant')
```

## Agent Selection

1. Check `cad_settings` for `use_admin_agent = 'true'` (is_admin=true)
2. If true → load `cad_flows.admin_agent_id` → use `cad_agents_admin`
3. Otherwise → use `cad_agents` for the professional's `user_id`

## Error Handling

- OpenAI failures: retry 3× with exponential backoff, then send friendly fallback message
- Tool failures: logged, skipped, orchestrator continues
- WhatsApp send failures: logged with full stack trace
- All errors use `LogService.create()` with `level='error'`

## Logging

Every step emits a structured log via `LogService` with:
- `module: 'ai_orchestrator'`
- `action`: one of the `LogAction` enum values
- `metadata`: relevant context (session_id, phone, tool names, response previews)

Key log actions: `message_received`, `openai_request`, `openai_response`, `tool_execution_start`, `tool_execution_complete`, `message_sent`, `customer_blocked`, `agent_selected`

## Environment Variables

```env
OPENAI_API_KEY=sk-...   # stored per-agent in cad_agents.openai_api_key
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/ai-orchestrator/webhook` | JWT | Receive WhatsApp message |
| PATCH | `/api/v1/settings/ai-orchestrator` | JWT + Admin | Toggle feature flag |
