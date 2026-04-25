import { AbstractTool } from './base-tool';
import { SessionContext, Slot } from '../types';
import { LogAction } from '../types';
import { enqueueAppointmentReminder } from '@/modules/queueJob/helpers/enqueueAppointmentReminder';

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

      // Build appointment title: prefix — Nome (service_type)
      const ctx = context as any;
      const prefix = ctx.appointment_prefix || 'Consulta';
      const customerName = context.name || 'Cliente';
      const serviceType = ctx.service_type;
      const appointmentTitle = serviceType && serviceType !== 'default'
        ? `${prefix} — ${customerName} (${serviceType})`
        : `${prefix} — ${customerName}`;

      // Check if Google Calendar is enabled for this professional
      const useGoogleCalendar = (context as any).use_google_calendar !== false;

      let calendarEventId = 'local_only';

      if (useGoogleCalendar && this.calendarService) {
        try {
          const calendarEvent = await this.calendarService.createEvent({
            userId: context.user_id,
            title: appointmentTitle,
            description: `Agendamento via WhatsApp\nCliente: ${context.name || 'N/A'}\nTelefone: ${context.phone}`,
            start: chosenSlot.start,
            end: chosenSlot.end,
            attendees: context.email ? [{ email: context.email }] : [],
          });
          calendarEventId = calendarEvent.id;
        } catch (calErr: any) {
          this.log(LogAction.TOOL_ERROR, `Google Calendar createEvent falhou (salvando só no banco): ${calErr.message}`, {
            user_id: context.user_id,
          });
          // Non-fatal — save locally only
        }
      }

      // Persist appointment locally
      const appointment = await this.appointmentService.create({
        customer_id: context.customer_id,
        user_id: context.user_id,
        customer_phone: context.phone,
        calendar_event_id: calendarEventId,
        title: appointmentTitle,
        start_at: chosenSlot.start,
        end_at: chosenSlot.end,
        status: 'confirmed',
        created_via: 'ai_orchestrator',
      });

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'book_appointment completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        appointment_id: appointment.id,
        calendar_event_id: calendarEventId,
        slot_index,
      });

      // Log appointment creation for audit
      this.log('appointment_created', 'Appointment created via AI orchestrator', {
        appointment_id: appointment.id,
        customer_id: context.customer_id,
        user_id: context.user_id,
        phone_number: context.phone,
        calendar_event_id: calendarEventId,
        start_time: chosenSlot.start,
        end_time: chosenSlot.end,
        google_calendar_used: useGoogleCalendar,
      });

      // Update context: clear slots, clear pending confirmation, record last booked
      (context as any).slots = [];
      (context as any).chosen_slot = chosenSlot;
      (context as any).pending_slot_confirmation = null;
      (context as any).last_booked_appointment = `${chosenSlot.label} — ${appointmentTitle}`;

      // Enqueue reminder job (non-fatal)
      await enqueueAppointmentReminder({
        appointment_id: appointment.id,
        user_id: context.user_id,
        customer_phone: context.phone,
        customer_name: context.name || context.phone,
        appointment_title: appointmentTitle,
        start_at: chosenSlot.start,
      });

      return {
        appointment,
        message: `Agendamento confirmado para ${chosenSlot.label}.`,
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