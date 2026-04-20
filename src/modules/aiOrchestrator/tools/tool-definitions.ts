import { ToolDefinition } from '../types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_slots',
      description: 'Lista horários disponíveis para agendamento. Chame quando o cliente quiser agendar ou pedir horários disponíveis. Se o cliente mencionar uma data específica, passe target_date EXATAMENTE como o cliente escreveu (ex: "28/04", "28/04/2026", "2026-04-28"). O sistema fará a conversão correta. Se mencionar horário específico (ex: "às 10h", "10:00"), passe target_time no formato HH:MM.',
      parameters: {
        type: 'object',
        properties: {
          target_date: {
            type: 'string',
            description: 'Data desejada pelo cliente. Passe EXATAMENTE como o cliente escreveu: "28/04", "28/04/2026", "2026-04-28", etc. NÃO tente converter o formato.'
          },
          target_time: {
            type: 'string',
            description: 'Horário desejado pelo cliente no formato HH:MM (ex: "10:00", "09:30").'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Cria o agendamento no slot escolhido pelo cliente. Chame quando o cliente responder com um número (1, 2, 3 ou 4) indicando qual slot quer. NÃO espere confirmação adicional — agende diretamente quando o cliente escolher o número.',
      parameters: {
        type: 'object',
        properties: {
          slot_index: {
            type: 'number',
            description: 'Número do slot escolhido pelo cliente (1-4), conforme a lista apresentada.'
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
      name: 'get_pricing',
      description: 'Retorna a tabela de preços e serviços do profissional. Chame quando o cliente perguntar sobre valores, preços, quanto custa, tabela de serviços ou o que está disponível.',
      parameters: { type: 'object', properties: {}, required: [] }
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