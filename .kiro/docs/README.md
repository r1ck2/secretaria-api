# Documentação Técnica — AllcanceAgents API

## Arquitetura

### AI Orchestrator
Fluxo principal de atendimento via WhatsApp:

```
WhatsApp → Evolution API → Webhook (triggerFlowEvolution)
  → FlowEngineService.receiveMessage()
    → [se use_ai_orchestrator=true] AIOrchestrator.receiveMessage()
      1. Verifica bloqueio do cliente
      2. Cria/recupera sessão (FlowSession)
      3. Enriquece contexto (cliente, configurações do profissional)
      4. Seleciona agente (selected_agent_id > admin_agent > professional_agent)
      5. Chama OpenAI com system prompt + histórico + tools
      6. Se tool_calls → executa tools → segunda chamada OpenAI com resultados
      7. Envia resposta final via WhatsApp (Evolution API)
```

### Tools disponíveis
| Tool | Quando usar |
|------|-------------|
| `list_slots` | Cliente quer agendar — lista horários disponíveis |
| `set_pending_slot` | Cliente escolheu um número de slot — registra para confirmação |
| `book_appointment` | Cliente confirmou com "sim" — cria agendamento |
| `cancel_appointment` | Cliente quer cancelar — lista agendamentos confirmados |
| `register_customer` | Cliente não cadastrado — cria registro |
| `create_todo` | Cliente quer falar com equipe — cria card no Kanban |

### Configurações por profissional (cad_settings)
| Chave | Descrição |
|-------|-----------|
| `company_name` | Nome da empresa apresentado ao cliente |
| `selected_agent_id` | ID do agente admin escolhido pelo profissional |
| `use_google_calendar` | Se false, agendamentos só no banco local |
| `working_days` | JSON array de dias (seg, ter, qua, qui, sex, sab, dom) |
| `working_hours_start` | Horário início (HH:MM) |
| `working_hours_end` | Horário fim (HH:MM) |
| `service_type` | default / presencial / online |
| `appointment_duration_minutes` | Duração padrão em minutos |
| `appointment_prefix` | Prefixo do título do agendamento |

### Logs
Módulos de log:
- `ai_orchestrator` — fluxo da IA (recebimento, processamento, envio)
- `evolution_api` — webhook e envio de mensagens
- `flow_automation` — FlowEngine (modo legado)

Ações principais do AI Orchestrator:
- `message_received` — 📨 mensagem recebida do cliente
- `openai_request` — 🤖 enviando para AI
- `openai_response` — 🤖 AI respondeu
- `tool_execution_start` — 🔧 executando tool
- `tool_execution_complete` — ✅ tool concluída
- `message_sent` — 📤 resposta enviada ao cliente
