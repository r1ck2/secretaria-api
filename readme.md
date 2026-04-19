
# ALLCANCEAGENTS - API

-- Comandos
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000002-flow-default.js 2>&1 | tail -5
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000003-flow-psicologo.js 2>&1 | tail -5
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000002-flow-default-v2.js 2>&1 | tail -5

---

## AI Orchestrator

Replaces the rigid FlowEngine with a fully AI-driven conversation loop using OpenAI Tool Calling.

### How it works

Every incoming WhatsApp message is processed by `AIOrchestrator.receiveMessage()`:
1. Checks if customer is blocked
2. Finds or creates a session
3. Enriches context (customer data, active appointments)
4. Selects the agent (admin or professional)
5. Calls OpenAI with tool definitions
6. Executes any tool calls (schedule, cancel, register, create todo)
7. Sends the AI response via WhatsApp

### Environment Variables

```env
# Stored per-agent in cad_agents.openai_api_key — no global env var needed
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/ai-orchestrator/webhook` | Receive WhatsApp message (JWT required) |
| `PATCH` | `/api/v1/settings/ai-orchestrator` | Enable/disable feature toggle (Admin only) |

### Feature Toggle

The AI Orchestrator is disabled by default. Enable it via:

```bash
curl -X PATCH https://your-api/api/v1/settings/ai-orchestrator \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

When enabled, all messages are routed to the AI Orchestrator instead of the FlowEngine. Disable at any time to roll back instantly — no deployment needed.

### Documentation

- Architecture: `docs/ai-orchestrator-architecture.md`
- Migration guide: `docs/ai-orchestrator-migration.md`

### Run migrations

```bash
npx dotenv -e .env.development -- npx sequelize-cli db:migrate
```
