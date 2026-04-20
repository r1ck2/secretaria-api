import { ToolDefinition } from '../types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_slots',
      description: 'Lista horários disponíveis para agendamento. Chame quando o cliente quiser agendar ou pedir horários disponíveis. Se o cliente mencionar uma data específica (ex: "dia 30/04", "amanhã", "semana que vem"), passe target_date. Se mencionar horário específico (ex: "às 10h"), passe target_time.',
      parameters: {
        type: 'object',
        properties: {
          target_date: {
            type: 'string',
            description: 'Data desejada pelo cliente no formato YYYY-MM-DD (ex: "2025-04-30"). Use quando o cliente pedir uma data específica.'
          },
          target_time: {
            type: 'string',
            description: 'Horário desejado pelo cliente no formato HH:MM (ex: "10:00"). Use quando o cliente pedir um horário específico.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_pending_slot',
      description: 'Registra o slot escolhido pelo cliente para confirmação. Chame quando o cliente escolher um número de slot (1, 2, 3 ou 4) ANTES de confirmar o agendamento. Após chamar esta tool, apresente o resumo do slot e peça confirmação.',
      parameters: {
        type: 'object',
        properties: {
          slot_index: {
            type: 'number',
            description: 'Índice do slot escolhido pelo cliente (1-4)'
          }
        },
        required: ['slot_index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Confirma e cria o agendamento. Chame SOMENTE quando o cliente confirmar explicitamente (responder "sim", "confirmar", "pode agendar", "ok" etc.) após ter escolhido um slot. Use o slot_index do slot pendente de confirmação.',
      parameters: {
        type: 'object',
        properties: {
          slot_index: {
            type: 'number',
            description: 'Índice do slot a agendar (1-4). Use o mesmo índice do set_pending_slot.'
          }
        },
        required: ['slot_index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Lista agendamentos confirmados do cliente para cancelamento. Chame quando o cliente quiser cancelar ou desmarcar uma consulta.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confirm_cancel',
      description: 'Cancela efetivamente um agendamento específico. Chame SOMENTE após o cliente confirmar qual agendamento deseja cancelar (responder com número ou "sim" após listar os agendamentos).',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: {
            type: 'string',
            description: 'ID do agendamento a cancelar (obtido da lista retornada por cancel_appointment)'
          }
        },
        required: ['appointment_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: 'Cria um cartão Kanban para follow-up. Use quando o cliente precisar de atendimento humano ou houver ação pendente que não pode ser resolvida automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título do cartão' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Prioridade' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'register_customer',
      description: 'Cadastra um novo cliente. Chame quando o cliente não estiver cadastrado (is_returning_customer = Não) e você já tiver o nome confirmado.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome completo do cliente' },
          email: { type: 'string', description: 'Email (opcional)' },
          document: { type: 'string', description: 'CPF (opcional)' }
        },
        required: ['name']
      }
    }
  }
];