import { ToolDefinition } from '../types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_slots',
      description: 'Lista horários disponíveis para agendamento no Google Calendar do profissional. Retorna até 4 slots nos próximos 7 dias.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Agenda uma consulta no horário escolhido pelo cliente. Requer que list_slots tenha sido chamado anteriormente e o cliente tenha escolhido um slot.',
      parameters: {
        type: 'object',
        properties: {
          slot_index: {
            type: 'number',
            description: 'Índice do slot escolhido (1-4) da lista retornada por list_slots'
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
      description: 'Lista agendamentos confirmados do cliente e permite cancelamento. Retorna lista de consultas agendadas.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: 'Cria um cartão Kanban para follow-up ou tarefa pendente. Usado quando o cliente precisa de atendimento humano ou há uma ação pendente.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Título do cartão (ex: "Retorno para cliente: João Silva")'
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Prioridade do cartão'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'register_customer',
      description: 'Cadastra um novo cliente no sistema. Usado quando um número não cadastrado entra em contato.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Nome completo do cliente'
          },
          email: {
            type: 'string',
            description: 'Email do cliente (opcional)'
          },
          document: {
            type: 'string',
            description: 'CPF ou documento do cliente (opcional)'
          }
        },
        required: ['name']
      }
    }
  }
];