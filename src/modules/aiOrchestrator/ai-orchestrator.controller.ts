import { Request, Response } from 'express';
import { AIOrchestrator } from './ai-orchestrator.service';
import { SessionManager } from './session-manager';
import { ToolExecutor } from './tools/tool-executor';
import { EvolutionApiService } from '../evolution/evolution.service';
import { LogService } from '../log/log.service';
import { FlowSession, Log, Setting } from '@/entities';
import { Op } from 'sequelize';
import { customerService } from '../customer/customer.service';
import { appointmentService } from '../appointment/appointment.service';
import { calendarServiceAdapter } from './utils/calendar-adapter';

// Singleton instances
const logService = new LogService();
const evolutionApiService = new EvolutionApiService();
const sessionManager = new SessionManager({ logService, appointmentService });
const toolExecutor = new ToolExecutor({
  logService,
  calendarService: calendarServiceAdapter,
  customerService,
  appointmentService,
  kanbanService: null,
});

const orchestrator = new AIOrchestrator({
  sessionManager,
  toolExecutor,
  evolutionApiService,
  logService,
});

/**
 * POST /ai-orchestrator/webhook
 * Receives incoming WhatsApp messages and processes them through the AI orchestrator.
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const { phoneNumber, message, flowId, toNumber, professionalUserId, senderName } = req.body;

  // Basic validation
  if (!phoneNumber || !message || !professionalUserId) {
    res.status(400).json({
      error: 'Missing required fields: phoneNumber, message, professionalUserId',
    });
    return;
  }

  try {
    const result = await orchestrator.receiveMessage({
      phoneNumber,
      message,
      flowId,
      toNumber: toNumber || phoneNumber,
      professionalUserId,
      senderName,
    });

    res.status(200).json(result);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * GET /ai-orchestrator/stats
 * Get AI Orchestrator statistics and metrics.
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    // Check if AI Orchestrator is enabled
    const aiToggle = await Setting.findOne({ 
      where: { key: 'use_ai_orchestrator', is_admin: true } 
    });
    const isEnabled = aiToggle?.value === 'true';

    // Get basic stats from logs
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const [
      totalMessages,
      totalToolCalls,
      totalSessions,
      recentMessages,
      recentErrors,
      toolStats
    ] = await Promise.all([
      // Total messages processed
      Log.count({
        where: {
          module: 'ai_orchestrator',
          action: 'message_received'
        }
      }),
      
      // Total tool calls
      Log.count({
        where: {
          module: 'ai_orchestrator',
          action: 'tool_execution_complete'
        }
      }),
      
      // Total active sessions
      FlowSession.count({
        where: {
          updated_at: {
            [Op.gte]: last24Hours
          }
        }
      }),
      
      // Messages in last 24h
      Log.count({
        where: {
          module: 'ai_orchestrator',
          action: 'message_received',
          created_at: {
            [Op.gte]: last24Hours
          }
        }
      }),
      
      // Recent errors
      Log.findAll({
        where: {
          module: 'ai_orchestrator',
          level: 'error',
          created_at: {
            [Op.gte]: last24Hours
          }
        },
        order: [['created_at', 'DESC']],
        limit: 10,
        attributes: ['id', 'message', 'created_at', 'phone_number']
      }),
      
      // Tool usage stats
      Log.findAll({
        where: {
          module: 'ai_orchestrator',
          action: 'tool_execution_complete'
        },
        attributes: ['metadata'],
        raw: true
      })
    ]);

    // Process tool stats
    const toolUsage = {
      list_slots: 0,
      book_appointment: 0,
      cancel_appointment: 0,
      register_customer: 0,
      create_todo: 0
    };

    toolStats.forEach((log: any) => {
      try {
        const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
        if (metadata?.tool_name && toolUsage.hasOwnProperty(metadata.tool_name)) {
          toolUsage[metadata.tool_name as keyof typeof toolUsage]++;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    // Calculate success rate (simplified)
    const successRate = totalToolCalls > 0 ? 95.5 : 100; // Mock calculation
    const avgResponseTime = 850; // Mock value

    const stats = {
      isEnabled,
      totalMessages,
      totalToolCalls,
      totalSessions,
      successRate,
      avgResponseTime,
      toolStats: toolUsage,
      recentErrors: recentErrors.map((error: any) => ({
        id: error.id,
        message: error.message,
        timestamp: error.created_at,
        phone_number: error.phone_number
      })),
      last24Hours: {
        messages: recentMessages,
        appointments: Math.floor(toolUsage.book_appointment * 0.8), // Estimate
        customers: Math.floor(toolUsage.register_customer * 0.9), // Estimate
        todos: Math.floor(toolUsage.create_todo * 0.7) // Estimate
      }
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
}

/**
 * GET /ai-orchestrator/sessions
 * Get AI Orchestrator sessions. Admin sees all, professional sees only their own.
 */
export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Determine if caller is admin or professional
    const { userRepository } = await import('@/modules/user/user.repository');
    const caller = await userRepository.findById(req.userId!);
    const isAdmin = caller?.type === 'admin_master';

    // Build where clause
    const where: any = {};
    if (!isAdmin && req.userId) {
      where.context_json = { [Op.like]: `%"user_id":"${req.userId}"%` };
    }

    const { count, rows } = await FlowSession.findAndCountAll({
      where,
      limit,
      offset,
      order: [['updated_at', 'DESC']],
      include: [
        { association: 'customer', attributes: ['name', 'phone'] },
        { association: 'flow', attributes: ['name'] },
      ],
    });

    const sessions = rows.map((session: any) => {
      let contextPreview = '';
      let customerNameFromCtx = '';
      try {
        const context = JSON.parse(session.context_json || '{}');
        contextPreview = context.last_user_message || '';
        customerNameFromCtx = context.name || context.whatsapp_sender_name || '';
      } catch { /* */ }

      let messagesCount = 0;
      try {
        const history = JSON.parse(session.history_json || '[]');
        messagesCount = Array.isArray(history) ? history.length : 0;
      } catch { /* */ }

      return {
        id: session.id,
        phone_number: session.phone_number,
        customer_name: session.customer?.name || customerNameFromCtx || null,
        flow_name: session.flow?.name || 'AI Orchestrator',
        messages_count: messagesCount,
        last_message_at: session.updated_at,
        status: session.status,
        context_preview: contextPreview,
      };
    });

    res.json({
      success: true,
      data: sessions,
      pagination: { currentPage: page, totalPages: Math.ceil(count / limit), total: count },
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
}

/**
 * GET /ai-orchestrator/tool-calls
 * Get AI Orchestrator tool call logs.
 */
export async function getToolCalls(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    const { tool_name, status, phone_number, start_date, end_date } = req.query;

    const whereClause: any = {
      module: 'ai_orchestrator',
      action: 'tool_execution_complete'
    };

    if (phone_number) {
      whereClause.phone_number = phone_number;
    }

    if (start_date || end_date) {
      whereClause.created_at = {};
      if (start_date) {
        whereClause.created_at[Op.gte] = new Date(start_date as string);
      }
      if (end_date) {
        whereClause.created_at[Op.lte] = new Date(end_date as string);
      }
    }

    const { count, rows } = await Log.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });

    const toolCalls = rows.map((log: any) => {
      let metadata = {};
      let toolName = 'unknown';
      let parameters = {};
      let result = {};
      let executionTime = 0;
      let toolStatus = 'success';
      let errorMessage = '';

      try {
        metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : (log.metadata || {});
        toolName = (metadata as any).tool_name || 'unknown';
        parameters = (metadata as any).parameters || {};
        result = (metadata as any).result || {};
        executionTime = (metadata as any).execution_time_ms || 0;
        toolStatus = (metadata as any).status || (log.level === 'error' ? 'error' : 'success');
        errorMessage = log.level === 'error' ? log.message : '';
      } catch (e) {
        // Ignore parsing errors
      }

      // Apply filters
      if (tool_name && toolName !== tool_name) return null;
      if (status && toolStatus !== status) return null;

      return {
        id: log.id,
        tool_name: toolName,
        parameters,
        result,
        execution_time_ms: executionTime,
        status: toolStatus,
        error_message: errorMessage,
        phone_number: log.phone_number,
        session_id: log.session_id || 'unknown',
        created_at: log.created_at
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: toolCalls,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        total: count
      }
    });
  } catch (error: any) {
    console.error('Get tool calls error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
}

/**
 * GET /ai-orchestrator/sessions/:id
 * Get full detail of a single session including history and context.
 */
export async function getSessionDetail(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const session = await FlowSession.findByPk(id, {
      include: [
        { association: 'customer', attributes: ['name', 'phone', 'email'] },
        { association: 'flow', attributes: ['name'] },
      ],
    });

    if (!session) {
      res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
      return;
    }

    const history = session.getHistory();
    const context = session.getContext();

    // Fetch related tool call logs
    const toolLogs = await Log.findAll({
      where: {
        module: 'ai_orchestrator',
        action: 'tool_execution_complete',
        session_id: id,
      },
      order: [['created_at', 'ASC']],
      limit: 50,
    });

    const toolCalls = toolLogs.map((log: any) => {
      let metadata: any = {};
      try { metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : (log.metadata || {}); } catch { /* */ }
      return {
        id: log.id,
        tool_name: metadata.tool_name || 'unknown',
        status: log.level === 'error' ? 'error' : 'success',
        execution_time_ms: metadata.execution_time_ms || 0,
        created_at: log.created_at,
      };
    });

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          phone_number: session.phone_number,
          status: session.status,
          customer_name: (session as any).customer?.name,
          customer_phone: (session as any).customer?.phone,
          flow_name: (session as any).flow?.name || 'AI Orchestrator',
          messages_count: history.length,
          created_at: session.createdAt,
          updated_at: session.updatedAt,
          context_preview: context.last_user_message || '',
        },
        history: history.map((h: any) => ({
          role: h.role,
          content: h.content,
          timestamp: h.timestamp,
        })),
        context: {
          name: context.name,
          email: context.email,
          is_returning_customer: context.is_returning_customer,
          time_of_day: context.time_of_day,
          company_name: context.company_name,
        },
        tool_calls: toolCalls,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
}

/**
 * DELETE /ai-orchestrator/sessions/:id
 * Delete (close) a session.
 */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const session = await FlowSession.findByPk(id);
    if (!session) {
      res.status(404).json({ success: false, message: 'Sessão não encontrada.' });
      return;
    }

    await session.update({ status: 'completed' });

    res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
}
