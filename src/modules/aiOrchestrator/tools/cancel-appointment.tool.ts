import { AbstractTool } from './base-tool';
import { SessionContext, AppointmentSummary } from '../types';
import { LogAction } from '../types';

export class CancelAppointmentTool extends AbstractTool {
  constructor(
    private calendarService: any,
    private appointmentService: any,
    logService: any
  ) {
    super(logService);
  }

  async execute(args: Record<string, any>, context: SessionContext): Promise<{
    appointments: AppointmentSummary[];
    message: string;
  }> {
    this.log(LogAction.TOOL_EXECUTION_START, 'Starting cancel_appointment execution', {
      user_id: context.user_id,
      phone: context.phone,
    });

    try {
      // Get active appointments for this customer
      const activeAppointments = await this.appointmentService.findActiveByCustomer({
        customer_id: context.customer_id,
        user_id: context.user_id,
        status: 'confirmed',
      });

      if (!activeAppointments || activeAppointments.length === 0) {
        return {
          appointments: [],
          message: 'Você não possui agendamentos confirmados para cancelar.',
        };
      }

      // Format appointments for AI consumption
      const formattedAppointments: AppointmentSummary[] = activeAppointments.map((apt: any) => ({
        id: apt.id,
        calendar_event_id: apt.calendar_event_id,
        label: this.formatAppointmentLabel(apt.start_at),
        title: apt.title,
        start: apt.start_at,
        end: apt.end_at,
      }));

      // Save to context so AI can reference IDs for confirm_cancel
      (context as any).appointments = formattedAppointments;

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'cancel_appointment completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        appointments_found: formattedAppointments.length,
      });

      return {
        appointments: formattedAppointments,
        message: formattedAppointments.length === 1
          ? 'Encontrei 1 agendamento confirmado. Deseja cancelá-lo?'
          : `Encontrei ${formattedAppointments.length} agendamentos confirmados. Qual deseja cancelar?`,
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'cancel_appointment',
      });

      throw new Error(`Erro ao buscar agendamentos: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  async cancelSpecificAppointment(appointmentId: string, context: SessionContext): Promise<{
    cancelled: boolean;
    message: string;
  }> {
    this.log(LogAction.TOOL_EXECUTION_START, 'Starting specific appointment cancellation', {
      user_id: context.user_id,
      phone: context.phone,
      appointment_id: appointmentId,
    });

    try {
      // Get appointment details
      const appointment = await this.appointmentService.findById(appointmentId);
      
      if (!appointment || appointment.customer_id !== context.customer_id) {
        throw new Error('Agendamento não encontrado ou não pertence a este cliente.');
      }

      // Delete from Google Calendar only if enabled
      const useGoogleCalendar = (context as any).use_google_calendar !== false;
      if (useGoogleCalendar && this.calendarService && appointment.calendar_event_id !== 'local_only') {
        try {
          await this.calendarService.deleteEvent({
            userId: context.user_id,
            eventId: appointment.calendar_event_id,
          });
        } catch (calErr: any) {
          // Non-fatal — still cancel locally
          this.log(LogAction.TOOL_ERROR, 'Google Calendar delete failed (non-fatal)', {
            appointment_id: appointmentId,
            error: calErr.message,
          });
        }
      }

      // Update status to cancelled (soft delete)
      await this.appointmentService.updateStatus(appointmentId, 'cancelled');

      // Log cancellation for audit
      this.log('appointment_cancelled', 'Appointment cancelled via AI orchestrator', {
        appointment_id: appointmentId,
        customer_id: context.customer_id,
        user_id: context.user_id,
        phone_number: context.phone,
        calendar_event_id: appointment.calendar_event_id,
      });

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'Specific appointment cancellation completed', {
        user_id: context.user_id,
        phone: context.phone,
        appointment_id: appointmentId,
      });

      return {
        cancelled: true,
        message: `Agendamento de ${this.formatAppointmentLabel(appointment.start_at)} foi cancelado com sucesso.`,
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'cancel_specific_appointment',
        appointment_id: appointmentId,
      });

      throw new Error(`Erro ao cancelar agendamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  private formatAppointmentLabel(isoDateTime: string): string {
    const date = new Date(isoDateTime);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  }
}