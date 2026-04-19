import { AbstractTool } from './base-tool';
import { SessionContext, Slot } from '../types';
import { LogAction } from '../types';

export class BookAppointmentTool extends AbstractTool {
  constructor(
    private calendarService: any,
    private appointmentService: any,
    logService: any
  ) {
    super(logService);
  }

  async execute(args: Record<string, any>, context: SessionContext): Promise<{
    appointment: any;
    message: string;
  }> {
    const { slot_index } = args;

    this.log(LogAction.TOOL_EXECUTION_START, 'Starting book_appointment execution', {
      user_id: context.user_id,
      phone: context.phone,
      slot_index,
    });

    try {
      // Validate that slots exist in context
      if (!context.slots || context.slots.length === 0) {
        throw new Error('Nenhum horário disponível encontrado. Execute list_slots primeiro.');
      }

      // Validate slot_index
      if (slot_index < 1 || slot_index > context.slots.length) {
        throw new Error(`Índice de horário inválido. Escolha entre 1 e ${context.slots.length}.`);
      }

      const chosenSlot = context.slots[slot_index - 1];

      // Validate customer exists
      if (!context.customer_id) {
        throw new Error('Cliente não encontrado. Execute register_customer primeiro.');
      }

      // Create event in Google Calendar
      const calendarEvent = await this.calendarService.createEvent({
        userId: context.user_id,
        title: `Consulta - ${context.name || 'Cliente'}`,
        description: `Agendamento via WhatsApp\nCliente: ${context.name || 'N/A'}\nTelefone: ${context.phone}`,
        start: chosenSlot.start,
        end: chosenSlot.end,
        attendees: context.email ? [{ email: context.email }] : [],
      });

      // Persist appointment locally
      const appointment = await this.appointmentService.create({
        customer_id: context.customer_id,
        user_id: context.user_id,
        calendar_event_id: calendarEvent.id,
        title: `Consulta - ${context.name || 'Cliente'}`,
        start_at: chosenSlot.start,
        end_at: chosenSlot.end,
        status: 'confirmed',
        created_via: 'ai_orchestrator',
      });

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'book_appointment completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        appointment_id: appointment.id,
        calendar_event_id: calendarEvent.id,
        slot_index,
      });

      // Log appointment creation for audit
      this.log('appointment_created', 'Appointment created via AI orchestrator', {
        appointment_id: appointment.id,
        customer_id: context.customer_id,
        user_id: context.user_id,
        phone_number: context.phone,
        calendar_event_id: calendarEvent.id,
        start_time: chosenSlot.start,
        end_time: chosenSlot.end,
      });

      return {
        appointment,
        message: `Agendamento confirmado para ${chosenSlot.label}. Você receberá uma confirmação por email se forneceu seu endereço de email.`,
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'book_appointment',
        slot_index,
      });

      throw new Error(`Erro ao agendar consulta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}