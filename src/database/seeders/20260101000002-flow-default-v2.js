"use strict";
const { v4: uuidv4 } = require("uuid");

/**
 * FLUXO CORRIGIDO - REGRAS OBRIGATÓRIAS:
 * 
 * REGRA 1: Todo trigger DEVE retornar mensagem ao cliente (NUNCA silêncio)
 * REGRA 2: Se flow_session = waiting_input, validar entrada. Se inválida → menu principal
 * 
 * FLUXO:
 * 1. SEM SESSÃO → Menu: "Agendar | Cancelar | Falar com equipe" + Boas-vindas humanizadas
 * 2. AGENDAR → Consultar horários → Qualificar com AI → Lista + "0 para voltar"
 * 3. SELECIONOU HORÁRIO → Qualificar com AI → Confirmação: "Confirmar | Cancelar | Voltar"
 * 4. CONFIRMOU → Criar no Google Calendar → Confirmação final → Encerrar sessão
 * 5. PÓS-FINALIZAÇÃO → Reiniciar fluxo (voltar ao passo 1)
 * 6. FALAR COM EQUIPE → Criar card no kanban (já implementado)
 * 
 * PROIBIDO:
 * - Deixar cliente sem resposta
 * - Alucinar horários
 * - Prosseguir sem validar waiting_input
 * - Ignorar opção "0" ou "voltar"
 */

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
  sendCancelSuccess:   "n_send_cancel_success",
  // Doubt branch
  createTodo:          "n_create_todo",
  sendWait:            "n_send_wait",
  // Fallback menu
  sendMenu:            "n_send_menu",
  // Validation fallback
  sendInvalidInput:    "n_send_invalid_input",
};

const flowJson = {
  nodes: [
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. TRIGGER - Início do fluxo
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: IDS.trigger,
      type: "flowNode",
      position: { x: CX, y: 0 },
      data: { 
        nodeType: "trigger", 
        label: "Início: Nova mensagem WhatsApp" 
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. IA GERA SAUDAÇÃO PERSONALIZADA (REGRA 1: sempre responder)
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: IDS.aiWelcome,
      type: "flowNode",
      position: { x: CX, y: GAP },
      data: {
        nodeType: "ai_agent",
        label: "IA: Gerar Saudação Personalizada",
        system_prompt:
          "Você é um assistente de atendimento de consultório, amigável e acolhedor.\n\n" +
          "CONTEXTO:\n" +
          "- Cliente: {{name}}\n" +
          "- Mensagem: '{{message}}'\n" +
          "- Horário: {{time_of_day}}\n" +
          "{{returning_customer_hint}}\n\n" +
          "TAREFA:\n" +
          "Gere APENAS uma saudação calorosa e personalizada de 1 a 2 frases.\n" +
          "Seja específico ao nome do cliente, horário do dia e contexto da mensagem.\n" +
          "Se for cliente conhecido, demonstre reconhecimento.\n\n" +
          "PROIBIDO:\n" +
          "- Listar opções de menu\n" +
          "- Fazer perguntas\n" +
          "- Usar frases genéricas\n" +
          "- Adicionar texto além da saudação\n\n" +
          "Retorne SOMENTE a saudação personalizada.",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. ENVIAR SAUDAÇÃO + MENU (REGRA 1: sempre responder)
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. IA CLASSIFICA INTENÇÃO (REGRA 2: validar entrada)
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: IDS.aiIdentify,
      type: "flowNode",
      position: { x: CX, y: GAP * 3 },
      data: {
        nodeType: "ai_agent",
        label: "IA: Classificar Intenção",
        system_prompt:
          "Você é um classificador de intenção. Analise a mensagem do cliente e responda APENAS com uma das palavras abaixo:\n\n" +
          "OPÇÕES VÁLIDAS:\n" +
          "- 'agendar' — cliente quer agendar, marcar ou verificar horários de consulta, ou digitou '1'\n" +
          "- 'cancelar' — cliente quer cancelar, desmarcar ou remarcar uma consulta, ou digitou '2'\n" +
          "- 'duvida' — cliente tem dúvida, pergunta ou precisa falar com alguém, ou digitou '3'\n" +
          "- 'menu' — mensagem ambígua, saudação simples ou não se encaixa nas opções acima\n\n" +
          "IMPORTANTE:\n" +
          "Responda SOMENTE com uma dessas quatro palavras, sem nenhum texto adicional.\n\n" +
          "EXEMPLOS:\n" +
          "- 'quero marcar consulta' → 'agendar'\n" +
          "- '1' → 'agendar'\n" +
          "- 'preciso cancelar' → 'cancelar'\n" +
          "- 'oi' → 'menu'\n" +
          "- 'bom dia' → 'menu'",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CONDICIONAL: Quer agendar?
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 5b. CONDICIONAL: É cancelar?
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 5c. CONDICIONAL: É dúvida?
    // ═══════════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════════
    // RAMO CANCELAR
    // ═══════════════════════════════════════════════════════════════════════════

    // 5d. Buscar agendamentos para cancelar (REGRA 1: sempre responder)
    {
      id: IDS.cancelAppointment,
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 5.5 },
      data: { 
        nodeType: "cancel_appointment", 
        label: "Buscar Agendamentos" 
      },
    },

    // 5e. Confirmar cancelamento (REGRA 2: validar escolha)
    {
      id: IDS.confirmCancellation,
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 6.5 },
      data: { 
        nodeType: "confirm_cancellation", 
        label: "Confirmar Cancelamento" 
      },
    },

    // 5f. Mensagem de sucesso do cancelamento (REGRA 1: sempre responder)
    {
      id: IDS.sendCancelSuccess,
      type: "flowNode",
      position: { x: CX + 120, y: GAP * 7.5 },
      data: {
        nodeType: "send_message",
        label: "Confirmação de Cancelamento",
        message:
          "✅ Consulta cancelada com sucesso!\n\n" +
          "Se precisar reagendar, é só nos chamar. Estamos à disposição! 🌟\n\n" +
          "0️⃣ Voltar ao menu principal",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // RAMO AGENDAR
    // ═══════════════════════════════════════════════════════════════════════════

    // 6. Listar horários livres (NUNCA alucinar - usar Google Calendar)
    {
      id: IDS.listSlots,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 5 },
      data: { 
        nodeType: "list_slots", 
        label: "Listar Horários Livres (Google Calendar)" 
      },
    },

    // 7. Enviar opções de horário (REGRA 1: sempre responder + opção "0")
    {
      id: IDS.sendSlots,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 6 },
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

    // 8. IA confirma escolha (REGRA 2: validar entrada)
    {
      id: IDS.aiConfirm,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 7 },
      data: {
        nodeType: "ai_agent",
        label: "IA: Confirmar Escolha de Horário",
        system_prompt:
          "O cliente recebeu uma lista numerada de horários (1, 2, 3, 4) e deve escolher um pelo número.\n\n" +
          "TAREFA:\n" +
          "Analise a resposta do cliente e responda APENAS com:\n" +
          "- '1' se o cliente escolheu o primeiro horário\n" +
          "- '2' se o cliente escolheu o segundo horário\n" +
          "- '3' se o cliente escolheu o terceiro horário\n" +
          "- '4' se o cliente escolheu o quarto horário\n" +
          "- 'menu' se o cliente digitou 0, disse 'voltar', 'cancelar', 'menu' ou não quer mais agendar\n\n" +
          "IMPORTANTE:\n" +
          "Responda SOMENTE com o número (1, 2, 3 ou 4) ou a palavra 'menu'. Nada mais.\n\n" +
          "EXEMPLOS:\n" +
          "- 'quero o 2' → '2'\n" +
          "- 'pode ser o primeiro' → '1'\n" +
          "- 'às 9h' → '1'\n" +
          "- 'voltar' → 'menu'\n" +
          "- '0' → 'menu'\n" +
          "- 'não quero mais' → 'menu'",
      },
    },

    // 9. Condicional: escolheu horário válido? (REGRA 2: validar)
    {
      id: IDS.condSlot,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 8 },
      data: {
        nodeType: "conditional",
        label: "Escolheu horário válido?",
        condition: 'chosen_slot !== undefined && chosen_slot !== null',
      },
    },

    // 10. Criar agendamento no Google Calendar
    {
      id: IDS.bookAppointment,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 9 },
      data: { 
        nodeType: "book_appointment", 
        label: "Criar Agendamento no Google Calendar" 
      },
    },

    // 11. Confirmação final (REGRA 1: sempre responder)
    {
      id: IDS.sendConfirmation,
      type: "flowNode",
      position: { x: CX - 240, y: GAP * 10 },
      data: {
        nodeType: "send_message",
        label: "Enviar Confirmação Final",
        message:
          "✅ Consulta confirmada com sucesso!\n\n" +
          "📅 Data: {{appointment_date}}\n" +
          "🕐 Horário: {{appointment_time}}\n\n" +
          "Caso precise remarcar, entre em contato com antecedência.\n" +
          "Até lá! 🌟",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // RAMO DÚVIDA / FALAR COM EQUIPE
    // ═══════════════════════════════════════════════════════════════════════════

    // 12. Criar TODO no Kanban (já implementado)
    {
      id: IDS.createTodo,
      type: "flowNode",
      position: { x: CX + 240, y: GAP * 6 },
      data: {
        nodeType: "create_todo",
        label: "Criar TODO: Retorno Manual",
        todo_title: "Retorno para Cliente: {{name}}",
        priority: "high",
      },
    },

    // 13. Mensagem de espera (REGRA 1: sempre responder)
    {
      id: IDS.sendWait,
      type: "flowNode",
      position: { x: CX + 240, y: GAP * 7 },
      data: {
        nodeType: "send_message",
        label: "Enviar Mensagem de Espera",
        message:
          "Entendido, {{name}}! 👋\n\n" +
          "Vou encaminhar sua mensagem para nossa equipe.\n" +
          "Em breve um profissional entrará em contato.\n\n" +
          "Obrigado pela paciência! 🙏",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK - MENU (REGRA 2: quando intenção não reconhecida)
    // ═══════════════════════════════════════════════════════════════════════════

    // 14. Menu de opções (fallback quando intent = "menu" ou não reconhecido)
    {
      id: IDS.sendMenu,
      type: "flowNode",
      position: { x: CX, y: GAP * 5.5 },
      data: {
        nodeType: "send_message",
        label: "Menu de Opções (Fallback)",
        message:
          "Desculpe, não entendi bem. 😊\n\n" +
          "Posso ajudá-lo com:\n\n" +
          "1️⃣ Agendar uma consulta\n" +
          "2️⃣ Cancelar uma consulta\n" +
          "3️⃣ Falar com a equipe\n\n" +
          "Por favor, responda com o número da opção.",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDAÇÃO DE ENTRADA INVÁLIDA (REGRA 2)
    // ═══════════════════════════════════════════════════════════════════════════

    // 15. Mensagem de entrada inválida (REGRA 2: validar e retornar menu)
    {
      id: IDS.sendInvalidInput,
      type: "flowNode",
      position: { x: CX, y: GAP * 6.5 },
      data: {
        nodeType: "send_message",
        label: "Entrada Inválida - Retornar Menu",
        message:
          "Desculpe, não consegui entender sua resposta. 😔\n\n" +
          "Vamos recomeçar:\n\n" +
          "1️⃣ Agendar uma consulta\n" +
          "2️⃣ Cancelar uma consulta\n" +
          "3️⃣ Falar com a equipe\n\n" +
          "Por favor, responda com o número da opção.",
      },
    },
  ],

  edges: [
    // ═══════════════════════════════════════════════════════════════════════════
    // FLUXO PRINCIPAL
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Trigger → IA Saudação
    { 
      id: "e0", 
      source: IDS.trigger, 
      target: IDS.aiWelcome, 
      animated: true, 
      style: { stroke: "#00a1d7" } 
    },
    
    // IA Saudação → Enviar Saudação + Menu
    { 
      id: "e1", 
      source: IDS.aiWelcome, 
      target: IDS.sendWelcome, 
      style: { stroke: "#00a1d7" } 
    },
    
    // Saudação + Menu → IA classifica (após cliente responder)
    { 
      id: "e2", 
      source: IDS.sendWelcome, 
      target: IDS.aiIdentify, 
      style: { stroke: "#00a1d7" } 
    },
    
    // IA Classifica → Condicional Principal
    { 
      id: "e3", 
      source: IDS.aiIdentify, 
      target: IDS.conditional, 
      style: { stroke: "#00a1d7" } 
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // ROTEAMENTO DE INTENÇÕES
    // ═══════════════════════════════════════════════════════════════════════════

    // Condicional → Listar horários (Sim = agendar)
    { 
      id: "e4", 
      source: IDS.conditional, 
      sourceHandle: "yes", 
      target: IDS.listSlots,
      label: "Agendar", 
      style: { stroke: "#22c55e" }, 
      labelStyle: { fill: "#166534", fontWeight: 600, fontSize: 11 } 
    },

    // Condicional → cond_cancel (Não = não é agendar)
    { 
      id: "e5", 
      source: IDS.conditional, 
      sourceHandle: "no", 
      target: "n_cond_cancel",
      label: "Não agendar", 
      style: { stroke: "#ef4444" } 
    },

    // cond_cancel → Cancelar (Sim = cancelar)
    { 
      id: "e5a", 
      source: "n_cond_cancel", 
      sourceHandle: "yes", 
      target: IDS.cancelAppointment,
      label: "Cancelar", 
      style: { stroke: "#f97316" } 
    },

    // cond_cancel → cond_duvida (Não = não é cancelar)
    { 
      id: "e5b", 
      source: "n_cond_cancel", 
      sourceHandle: "no", 
      target: "n_cond_duvida",
      label: "Não cancelar", 
      style: { stroke: "#94a3b8" } 
    },

    // cond_duvida → Dúvida (Sim)
    { 
      id: "e5c", 
      source: "n_cond_duvida", 
      sourceHandle: "yes", 
      target: IDS.createTodo,
      label: "Dúvida", 
      style: { stroke: "#f59e0b" } 
    },

    // cond_duvida → Menu fallback (Não = intent=menu ou ambíguo)
    { 
      id: "e5d", 
      source: "n_cond_duvida", 
      sourceHandle: "no", 
      target: IDS.sendMenu,
      label: "Menu", 
      style: { stroke: "#94a3b8" } 
    },

    // Menu → IA classifica novamente (loop de validação)
    { 
      id: "e5e", 
      source: IDS.sendMenu, 
      target: IDS.aiIdentify,
      style: { stroke: "#94a3b8" } 
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FLUXO DE AGENDAMENTO
    // ═══════════════════════════════════════════════════════════════════════════

    // Listar horários → Enviar lista
    { 
      id: "e6", 
      source: IDS.listSlots, 
      target: IDS.sendSlots,
      style: { stroke: "#22c55e" } 
    },
    
    // Enviar lista → IA confirma escolha
    { 
      id: "e7", 
      source: IDS.sendSlots, 
      target: IDS.aiConfirm,
      style: { stroke: "#22c55e" } 
    },
    
    // IA confirma → Condicional de validação
    { 
      id: "e8", 
      source: IDS.aiConfirm, 
      target: IDS.condSlot,
      style: { stroke: "#22c55e" } 
    },
    
    // Horário escolhido → Criar agendamento
    { 
      id: "e8y", 
      source: IDS.condSlot, 
      sourceHandle: "yes", 
      target: IDS.bookAppointment,
      label: "Horário válido", 
      style: { stroke: "#22c55e" } 
    },
    
    // Voltou ao menu (disse 0/voltar) → Menu principal
    { 
      id: "e8n", 
      source: IDS.condSlot, 
      sourceHandle: "no", 
      target: IDS.sendMenu,
      label: "Voltar ao menu", 
      style: { stroke: "#94a3b8" } 
    },
    
    // Criar agendamento → Confirmação final
    { 
      id: "e9", 
      source: IDS.bookAppointment, 
      target: IDS.sendConfirmation,
      style: { stroke: "#22c55e" } 
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FLUXO DE CANCELAMENTO
    // ═══════════════════════════════════════════════════════════════════════════

    // Buscar agendamentos → Confirmar cancelamento
    { 
      id: "e10", 
      source: IDS.cancelAppointment, 
      target: IDS.confirmCancellation,
      style: { stroke: "#f97316" } 
    },
    
    // Confirmar cancelamento → Mensagem de sucesso
    { 
      id: "e11", 
      source: IDS.confirmCancellation, 
      target: IDS.sendCancelSuccess,
      style: { stroke: "#f97316" } 
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // FLUXO DE DÚVIDA / FALAR COM EQUIPE
    // ═══════════════════════════════════════════════════════════════════════════

    // Criar TODO → Mensagem de espera
    { 
      id: "e12", 
      source: IDS.createTodo, 
      target: IDS.sendWait,
      style: { stroke: "#f59e0b" } 
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // VALIDAÇÃO DE ENTRADA INVÁLIDA
    // ═══════════════════════════════════════════════════════════════════════════

    // Entrada inválida → IA classifica novamente
    { 
      id: "e13", 
      source: IDS.sendInvalidInput, 
      target: IDS.aiIdentify,
      style: { stroke: "#ef4444" } 
    },
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
        "Fluxo completo corrigido: SEMPRE responde ao cliente, valida entradas, " +
        "oferece opção de voltar ao menu, usa Google Calendar real (sem alucinações), " +
        "e reinicia após finalização. Inclui: agendamento, cancelamento e encaminhamento para equipe.",
      status: true,
      is_visible_to_professional: true,
      flow_json: JSON.stringify(flowJson),
      created_at: new Date(),
      updated_at: new Date(),
    }]);

    console.log("[Seed] Flow 'Padrão Agendamento' (v2 - CORRIGIDO) created successfully.");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=0");
    await queryInterface.bulkDelete("cad_flows", {
      name: "Padrão Agendamento",
    });
    await queryInterface.sequelize.query("SET FOREIGN_KEY_CHECKS=1");
  },
};
