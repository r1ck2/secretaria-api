import { FlowSession } from '../flowEngine/flowSession.entity';
import { Customer } from '../customer/customer.entity';
import { SessionContext, HistoryEntry, LogAction } from './types';

export interface SessionManagerDependencies {
  logService: any;
  customerService?: any;
  appointmentService?: any;
}

export class SessionManager {
  constructor(private dependencies: SessionManagerDependencies) {}

  /**
   * Encontra ou cria sessão ativa
   */
  async findOrCreateSession(params: {
    phoneNumber: string;
    flowId?: string;
    professionalUserId?: string;
  }): Promise<FlowSession> {
    const { phoneNumber, flowId, professionalUserId } = params;

    this.log(LogAction.SESSION_CREATED, 'Looking for existing session', {
      phone_number: phoneNumber,
      flow_id: flowId,
      user_id: professionalUserId,
    });

    try {
      // Normalize phone number for consistent lookup
      const normalizedPhone = this.normalizePhone(phoneNumber);

      // Look for existing active session
      const whereClause: any = {
        phone_number: normalizedPhone,
        status: ['active', 'waiting_input'],
      };
      // Only filter by flow_id if provided (AI Orchestrator sessions have no flow_id)
      if (flowId) whereClause.flow_id = flowId;

      let session = await FlowSession.findOne({
        where: whereClause,
        order: [['updated_at', 'DESC']],
      });

      if (session) {
        this.log(LogAction.SESSION_UPDATED, 'Found existing session', {
          session_id: session.id,
          phone_number: normalizedPhone,
          flow_id: flowId,
        });
        return session;
      }

      // Create new session if none found
      session = await FlowSession.create({
        phone_number: normalizedPhone,
        flow_id: flowId || null,
        status: 'active',
        context_json: JSON.stringify({
          phone: normalizedPhone,
          user_id: professionalUserId,
          flow_id: flowId || null,
          time_of_day: this.getTimeOfDay(),
          is_returning_customer: false,
        }),
        history_json: JSON.stringify([]),
      });

      this.log(LogAction.SESSION_CREATED, 'Created new session', {
        session_id: session.id,
        phone_number: normalizedPhone,
        flow_id: flowId,
        user_id: professionalUserId,
      });

      return session;

    } catch (error) {
      this.logError(LogAction.SESSION_CREATED, error as Error, {
        phone_number: phoneNumber,
        flow_id: flowId,
        user_id: professionalUserId,
      });
      throw error;
    }
  }

  /**
   * Atualiza contexto da sessão
   */
  async updateContext(
    sessionId: string,
    updates: Partial<SessionContext>
  ): Promise<void> {
    try {
      const session = await FlowSession.findByPk(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const currentContext = session.getContext();
      const updatedContext = { ...currentContext, ...updates };

      // Validate that the context can be serialized
      try {
        JSON.stringify(updatedContext);
      } catch (serializationError) {
        throw new Error(`Context cannot be serialized: ${serializationError}`);
      }

      session.setContext(updatedContext);
      await session.save();

      this.log(LogAction.SESSION_UPDATED, 'Session context updated', {
        session_id: sessionId,
        updated_fields: Object.keys(updates),
      });

    } catch (error) {
      this.logError(LogAction.SESSION_UPDATED, error as Error, {
        session_id: sessionId,
        updates: Object.keys(updates),
      });
      throw error;
    }
  }

  /**
   * Adiciona mensagem ao histórico
   */
  async pushMessage(
    sessionId: string,
    message: HistoryEntry
  ): Promise<void> {
    try {
      const session = await FlowSession.findByPk(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Add timestamp if not present
      const messageWithTimestamp = {
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      };

      session.pushHistory(messageWithTimestamp);
      await session.save();

      this.log(LogAction.SESSION_UPDATED, 'Message added to session history', {
        session_id: sessionId,
        role: message.role,
        content_length: message.content.length,
      });

    } catch (error) {
      this.logError(LogAction.SESSION_UPDATED, error as Error, {
        session_id: sessionId,
        message_role: message.role,
      });
      throw error;
    }
  }

  /**
   * Enriquece contexto com dados do cliente
   */
  async enrichContext(session: FlowSession): Promise<SessionContext> {
    this.log(LogAction.CONTEXT_ENRICHED, 'Starting context enrichment', {
      session_id: session.id,
      phone_number: session.phone_number,
    });

    try {
      const baseContext = session.getContext();
      
      // Start with base context
      const enrichedContext: SessionContext = {
        phone: session.phone_number,
        user_id: baseContext.user_id || '',
        flow_id: session.flow_id,
        time_of_day: this.getTimeOfDay(),
        last_user_message: this.getLastUserMessage(session),
        is_returning_customer: false,
        ...baseContext, // Merge existing context
      };

      // Try to find customer by phone
      let customer: Customer | null = null;
      try {
        customer = await Customer.findOne({
          where: { phone: session.phone_number }
        });
      } catch (customerError) {
        this.log(LogAction.CONTEXT_ENRICHED, 'Customer lookup failed, continuing without customer data', {
          session_id: session.id,
          phone_number: session.phone_number,
          error: customerError instanceof Error ? customerError.message : 'Unknown error',
        });
      }

      if (customer) {
        enrichedContext.customer_id = customer.id;
        enrichedContext.name = customer.name;
        enrichedContext.email = customer.email;
        enrichedContext.is_returning_customer = true;

        // Update session with customer_id if not already set
        if (!session.customer_id) {
          session.customer_id = customer.id;
          await session.save();
        }

        // Try to get appointments if appointment service is available
        if (this.dependencies.appointmentService) {
          try {
            const appointments = await this.dependencies.appointmentService.findActiveByCustomer({
              customer_id: customer.id,
              user_id: enrichedContext.user_id,
              status: 'confirmed',
            });

            if (appointments && appointments.length > 0) {
              enrichedContext.appointments = appointments.map((apt: any) => ({
                id: apt.id,
                calendar_event_id: apt.calendar_event_id,
                label: this.formatAppointmentLabel(apt.start_at),
                title: apt.title,
                start: apt.start_at,
                end: apt.end_at,
              }));
            }
          } catch (appointmentError) {
            this.log(LogAction.CONTEXT_ENRICHED, 'Appointment lookup failed, continuing without appointment data', {
              session_id: session.id,
              customer_id: customer.id,
              error: appointmentError instanceof Error ? appointmentError.message : 'Unknown error',
            });
          }
        }
      }

      this.log(LogAction.CONTEXT_ENRICHED, 'Context enrichment completed', {
        session_id: session.id,
        has_customer: !!customer,
        is_returning_customer: enrichedContext.is_returning_customer,
        appointments_count: enrichedContext.appointments?.length || 0,
      });

      return enrichedContext;

    } catch (error) {
      this.logError(LogAction.CONTEXT_ENRICHED, error as Error, {
        session_id: session.id,
        phone_number: session.phone_number,
      });

      // Return basic context on error
      const fallbackContext = session.getContext();
      return {
        phone: session.phone_number,
        user_id: fallbackContext.user_id || '',
        flow_id: session.flow_id,
        time_of_day: this.getTimeOfDay(),
        last_user_message: this.getLastUserMessage(session),
        is_returning_customer: false,
        ...fallbackContext,
      };
    }
  }

  private normalizePhone(phone: string): string {
    // Remove all non-numeric characters
    return phone.replace(/\D/g, '');
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'bom dia';
    if (hour < 18) return 'boa tarde';
    return 'boa noite';
  }

  private getLastUserMessage(session: FlowSession): string {
    const history = session.getHistory();
    const lastUserMessage = history
      .filter((entry: any) => entry.role === 'user')
      .pop();
    return lastUserMessage?.content || '';
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

  private log(action: LogAction, message: string, metadata?: Record<string, any>) {
    if (this.dependencies.logService && typeof this.dependencies.logService.log === 'function') {
      this.dependencies.logService.log({
        level: 'info',
        action,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private logError(action: LogAction, error: Error, metadata?: Record<string, any>) {
    if (this.dependencies.logService && typeof this.dependencies.logService.log === 'function') {
      this.dependencies.logService.log({
        level: 'error',
        action,
        message: error.message,
        metadata: {
          ...metadata,
          stack_trace: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}