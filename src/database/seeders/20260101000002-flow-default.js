"use strict";
const { v4: uuidv4 } = require("uuid");

const CX = 320;
const GAP = 140;

const IDS = {
  trigger:             "n_trigger",
  aiWelcome:           "n_ai_welcome",
  sendWelcome:         "n_send_welcome",
  aiIdentify:          "n_ai_identify",
  conditional:         "n_conditional",
  // Schedule branch
  listSlots:           "n_list_slots",
  sendSlots:           "n_send_slots",
  aiConfirm:           "n_ai_confirm",
  condSlot:            "n_cond_slot",
  bookAppointment:     "n_book",
  sendConfirmation:    "n_send_confirm",
  // Cancel branch
  cancelAppointment:   "n_cancel_appointment",
  confirmCancellation: "n_confirm_cancellation",
  // Doubt branch
  createTodo:          "n_create_todo",
  sendWait:            "n_send_wait",
  // Fallback menu
  sendMenu:            "n_send_menu",
};

const flowJson = {
  nodes: [
    // 1. Trigger
    {
      id: IDS.trigger,
      type: "flowNode",
      position: { x: CX, y: 0 },
      data: { nodeType: "trigger", label: "Início: Nova mensagem WhatsApp" },
    },

    // 2. IA gera APENAS a saudação personalizada (sem menu — menu é concatenado no send_message)
    {
      id: IDS.aiWelcome,
      type: "flowNode",
      position: { x: CX, y: GAP },
      data: {
        nodeType: "ai_agent",
        label: "IA: Gerar Saudação Personalizada",
        system_prompt:
          "Você é um assistente de atendimento de consultório, amigável e acolhedor. " +
          "O cliente se chama {{name}} e enviou a seguinte mensagem: '{{message}}'. " +
          "Com base nisso, gere APENAS uma saudação calorosa e personalizada de 1 a 2 frases. " +
          "Seja específico ao nome do cliente e ao contexto da mensagem dele. " +
          "NÃO liste opções de menu. NÃO faça perguntas. NÃO use frases genéricas. " +
          "Retorne SOMENTE a saudação, sem nenhum texto adicional.",
      },
    },

    // 3. Enviar saudação da IA concatenada com o menu fixo de opções
    {
      id: IDS.sendWelcome,
      type: "flowNode",
      position: { x: CX, y: GAP * 2 },
      data: {
        nodeType: "send_message",
        label: "Enviar Saudação + Menu",
        message:
          "{{ai_response}}\n\n" +
          "Como posso ajudá-lo hoje?\n\n" +
          "1️⃣ Agendar uma consulta\n" +
          "2️⃣ Cancelar uma consulta\n" +
          "3️⃣ Falar com a equipe\n\n" +
          "Responda com o número da opção ou descreva o que precisa.",
      },
    },

    // 4. IA classifica intenção (responde APENAS com keyword: agendar | cancelar | duvida | menu)
    {
      id: IDS.aiIdentify,
      type: "flowNode",
      position: { x: CX, y: GAP * 3 },
      data: {
        nodeType: "ai_agent",
        label: "IA: Classificar Intenção",
        system_prompt:
          "Você é um classificador de intenção. Analise a mensagem do cliente e responda APENAS com uma das palavras abaixo, sem nenhum texto adicional:\n" +
          "- 'agendar' — se o cliente quer agendar, marcar ou verificar horários de consulta, ou digitou '1'\n" +
          "- 'cancelar' — se o cliente quer cancelar, desmarcar ou remarcar uma consulta, ou digitou '2'\n" +
          "- 'duvida' — se o cliente tem uma dúvida, pergunta ou precisa falar com alguém, ou digitou '3'\n" +
          "- 'menu' — se a mensagem for ambígua, saudação simples ou não se encaixar nas opções acima\n\n" +
          "Responda SOMENTE com uma dessas quatro palavras.",
      },
    },

    // 5. Condicional: quer agendar?
    {
      id: IDS.conditional,
      type: "flowNode",
      position: { x: CX, y: GAP * 4 },
      data: {
        nodeType: "conditional",
        label: "Quer agendar?",
        condition: 'intent === "agendar"',
      },
    },

    // 5b. Condicional: é cancelar?
    {
      id: "n_cond_cancel",
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 4.5 },
      data: {
        nodeType: "conditional",
        label: "Quer cancelar?",
        condition: 'intent === "cancelar"',
      },
    },

    // 5c. Condicional: é dúvida?
    {
      id: "n_cond_duvida",
      type: "flowNode",
      position: { x: CX + 240, y: GAP * 5 },
      data: {
        nodeType: "conditional",
        label: "É dúvida?",
        condition: 'intent === "duvida"',
      },
    },

    // ── Ramo CANCELAR ─────────────────────────────────────────────────────────

    // 5d. Buscar agendamentos para cancelar
    {
      id: IDS.cancelAppointment,
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 5.5 },
      data: { nodeType: "cancel_appointment", label: "Buscar Agendamentos" },
    },

    // 5e. Confirmar cancelamento (cliente escolhe qual)
    {
      id: IDS.confirmCancellation,
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 6.5 },
      data: { nodeType: "confirm_cancellation", label: "Confirmar Cancelamento" },
    },

    // ── Ramo SIM — Agendamento ────────────────────────────────────────────────

    // 5. Listar horários livres
    {
      id: IDS.listSlots,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 4 },
      data: { nodeType: "list_slots", label: "Listar Horários Livres" },
    },

    // 6. Enviar opções de horário
    {
      id: IDS.sendSlots,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 5 },
      data: {
        nodeType: "send_message",
        label: "Enviar Opções de Horário",
        message:
          "Ótimo! Temos os seguintes horários disponíveis:\n\n" +
          "{{slots}}\n\n" +
          "0️⃣ Voltar ao menu principal\n\n" +
          "Qual horário prefere? Responda com o número da opção ou 0 para voltar.",
      },
    },

    // 7b. Condicional: voltou ao menu ou escolheu horário?
    {
      id: "n_cond_slot",
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 6.5 },
      data: {
        nodeType: "conditional",
        label: "Escolheu horário?",
        condition: 'chosen_slot !== undefined && chosen_slot !== null',
      },
    },

    // 7. IA confirma escolha e extrai slot_choice do contexto
    {
      id: IDS.aiConfirm,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 6 },
      data: {
        nodeType: "ai_agent",
        label: "IA: Confirmar Escolha",
        system_prompt:
          "O cliente recebeu uma lista numerada de horários (1, 2, 3, 4) e deve escolher um pelo número.\n" +
          "Analise a resposta do cliente e responda APENAS com:\n" +
          "- '1' se o cliente escolheu o primeiro horário\n" +
          "- '2' se o cliente escolheu o segundo horário\n" +
          "- '3' se o cliente escolheu o terceiro horário\n" +
          "- '4' se o cliente escolheu o quarto horário\n" +
          "- 'menu' se o cliente digitou 0, disse 'voltar', 'cancelar', 'menu' ou não quer mais agendar\n\n" +
          "IMPORTANTE: Responda SOMENTE com o número (1, 2, 3 ou 4) ou a palavra 'menu'. Nada mais.\n" +
          "Exemplos: 'quero o 2' → '2' | 'pode ser o primeiro' → '1' | 'às 9h' → '1' | 'voltar' → 'menu'",
      },
    },

    // 8. Criar agendamento
    {
      id: IDS.bookAppointment,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 7 },
      data: { nodeType: "book_appointment", label: "Criar Agendamento no Calendar" },
    },

    // 9. Confirmação final
    {
      id: IDS.sendConfirmation,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 8 },
      data: {
        nodeType: "send_message",
        label: "Enviar Confirmação",
        message:
          "✅ Consulta confirmada!\n\n" +
          "📅 Data: {{appointment_date}}\n" +
          "🕐 Horário: {{appointment_time}}\n\n" +
          "Caso precise remarcar, entre em contato com antecedência. Até lá! 🌟",
      },
    },

    // ── Ramo NÃO — Dúvida ────────────────────────────────────────────────────

    // 10. Criar TODO
    {
      id: IDS.createTodo,
      type: "flowNode",
      position: { x: CX + 240, y: GAP * 4 },
      data: {
        nodeType: "create_todo",
        label: "Criar TODO: Retorno Manual",
        todo_title: "Retorno para Cliente: {{name}}",
        priority: "high",
      },
    },

    // 11. Mensagem de espera
    {
      id: IDS.sendWait,
      type: "flowNode",
      position: { x: CX + 240, y: GAP * 5 },
      data: {
        nodeType: "send_message",
        label: "Enviar Mensagem de Espera",
        message:
          "Entendido, {{name}}! 👋 Vou encaminhar sua mensagem para nossa equipe.\n\n" +
          "Em breve um profissional entrará em contato. Obrigado pela paciência! 🙏",
      },
    },

    // ── Fallback — Menu (intenção não reconhecida) ────────────────────────────

    // 12. Menu de opções (fallback quando intent = "menu" ou não reconhecido)
    {
      id: IDS.sendMenu,
      type: "flowNode",
      position: { x: CX, y: GAP * 4 },
      data: {
        nodeType: "send_message",
        label: "Menu de Opções (Fallback)",
        message:
          "Desculpe, não entendi bem. 😊 Posso ajudá-lo com:\n\n" +
          "1️⃣ Agendar uma consulta\n" +
          "2️⃣ Cancelar uma consulta\n" +
          "3️⃣ Falar com a equipe\n\n" +
          "Por favor, responda com o número da opção.",
      },
    },
  ],

  edges: [
    // Trigger → IA Saudação
    { id: "e0", source: IDS.trigger,     target: IDS.aiWelcome,     animated: true, style: { stroke: "#00a1d7" } },
    // IA Saudação → Enviar Saudação
    { id: "e1", source: IDS.aiWelcome,   target: IDS.sendWelcome,   style: { stroke: "#00a1d7" } },
    // Saudação → IA classifica (após cliente responder)
    { id: "e2", source: IDS.sendWelcome, target: IDS.aiIdentify,    style: { stroke: "#00a1d7" } },
    // IA → Condicional
    { id: "e3", source: IDS.aiIdentify,  target: IDS.conditional,   style: { stroke: "#00a1d7" } },

    // Condicional → Listar horários (Sim = agendar)
    { id: "e4", source: IDS.conditional, sourceHandle: "yes", target: IDS.listSlots,
      label: "Agendar", style: { stroke: "#22c55e" }, labelStyle: { fill: "#166534", fontWeight: 600, fontSize: 11 } },

    // Condicional → cond_cancel (Não = não é agendar)
    { id: "e5", source: IDS.conditional, sourceHandle: "no", target: "n_cond_cancel",
      label: "Não agendar", style: { stroke: "#ef4444" } },

    // cond_cancel → Cancelar (Sim = cancelar)
    { id: "e5a", source: "n_cond_cancel", sourceHandle: "yes", target: IDS.cancelAppointment,
      label: "Cancelar", style: { stroke: "#f97316" } },

    // cancelAppointment → confirmCancellation (cliente escolhe qual cancelar)
    { id: "e5a2", source: IDS.cancelAppointment, target: IDS.confirmCancellation },

    // cond_cancel → cond_duvida (Não = não é cancelar)
    { id: "e5b0", source: "n_cond_cancel", sourceHandle: "no", target: "n_cond_duvida",
      label: "Não cancelar", style: { stroke: "#94a3b8" } },

    // cond_duvida → Dúvida (Sim)
    { id: "e5b", source: "n_cond_duvida", sourceHandle: "yes", target: IDS.createTodo,
      label: "Dúvida", style: { stroke: "#f59e0b" } },

    // cond_duvida → Menu fallback (Não = intent=menu ou ambíguo)
    { id: "e5c", source: "n_cond_duvida", sourceHandle: "no", target: IDS.sendMenu,
      label: "Menu", style: { stroke: "#94a3b8" } },

    // Menu → IA classifica novamente
    { id: "e5d", source: IDS.sendMenu, target: IDS.aiIdentify },

    // Schedule path
    { id: "e6", source: IDS.listSlots,       target: IDS.sendSlots },
    { id: "e7", source: IDS.sendSlots,       target: IDS.aiConfirm },
    { id: "e8", source: IDS.aiConfirm,       target: "n_cond_slot" },
    // Chose a slot → book
    { id: "e8y", source: "n_cond_slot", sourceHandle: "yes", target: IDS.bookAppointment,
      label: "Horário escolhido", style: { stroke: "#22c55e" } },
    // Returned to menu (said 0/voltar)
    { id: "e8n", source: "n_cond_slot", sourceHandle: "no", target: IDS.sendMenu,
      label: "Voltar ao menu", style: { stroke: "#94a3b8" } },
    { id: "e9", source: IDS.bookAppointment, target: IDS.sendConfirmation },

    // Doubt path
    { id: "e10", source: IDS.createTodo, target: IDS.sendWait },

    // Fallback menu — sendWait loops back to welcome for next interaction
    // (session will be waiting_input after sendWait, next message restarts from aiIdentify)
  ],
};

module.exports = {
  async up(queryInterface) {
    const [users] = await queryInterface.sequelize.query(
      `SELECT id FROM cad_users WHERE type = 'admin_master' LIMIT 1`
    );
    if (!users.length) {
      console.warn("[Seed] No admin_master user found — skipping.");
      return;
    }

    // Remove old version if exists
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=0");
    await queryInterface.bulkDelete("cad_flows", {
      name: "Padrão Agendamento",
    });
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=1");

    await queryInterface.bulkInsert("cad_flows", [{
      id: uuidv4(),
      user_id: users[0].id,
      name: "Padrão Agendamento",
      description:
        "Fluxo completo: saudação → classificação de intenção → agendamento via Calendar " +
        "ou encaminhamento para equipe. Fallback com menu de opções.",
      status: true,
      is_visible_to_professional: true,
      flow_json: JSON.stringify(flowJson),
      created_at: new Date(),
      updated_at: new Date(),
    }]);

    console.log("[Seed] Flow 'Atendimento Agendamento' updated successfully.");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=0");
    await queryInterface.bulkDelete("cad_flows", {
      name: "Padrão Agendamento",
    });
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=1");
  },
};
