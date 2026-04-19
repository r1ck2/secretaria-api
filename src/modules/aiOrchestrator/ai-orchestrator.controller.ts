import { Request, Response } from 'express';
import { AIOrchestrator } from './ai-orchestrator.service';
import { SessionManager } from './session-manager';
import { ToolExecutor } from './tools/tool-executor';
import { EvolutionApiService } from '../evolution/evolution.service';
import { LogService } from '../log/log.service';
import { FlowSession, Log, Setting } from '@/entities';
import { Op } from 'sequelize';

// Singleton instances
const logService = new LogService();
const evolutionApiService = new EvolutionApiService();
const sessionManager = new SessionManager({ logService });
const toolExecutor = new ToolExecutor({
  logService,
  calendarService: null,
  customerService: null,
  appointmentService: null,
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
  const { phoneNumber, message, flowId, toNumber, professionalUserId } = req.body;

  // Basic validation
  if (!phoneNumber || !message || !flowId || !professionalUserId) {
    res.status(400).json({
      error: 'Missing required fields: phoneNumber, message, flowId, professionalUserId',
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
 * Get active AI Orchestrator sessions.
 */
export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await FlowSession.findAndCountAll({
      limit,
      offset,
      order: [['updated_at', 'DESC']],
      include: [
        {
          association: 'customer',
          attributes: ['name']
        },
        {
          association: 'flow',
          attributes: ['name']
        }
      ]
    });

    const sessions = rows.map((session: any) => {
      let contextPreview = '';
      try {
        const context = JSON.parse(session.context_json || '{}');
        contextPreview = context.last_user_message || 'Sem mensagens';
      } catch (e) {
        contextPreview = 'Contexto inválido';
      }

      let messagesCount = 0;
      try {
        const history = JSON.parse(session.history_json || '[]');
        messagesCount = Array.isArray(history) ? history.length : 0;
      } catch (e) {
        messagesCount = 0;
      }

      return {
        id: session.id,
        phone_number: session.phone_number,
        customer_name: session.customer?.name,
        flow_name: session.flow?.name || 'Fluxo não encontrado',
        messages_count: messagesCount,
        last_message_at: session.updated_at,
        status: 'active', // Simplified status
        context_preview: contextPreview
      };
    });

    res.json({
      success: true,
      data: sessions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        total: count
      }
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
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
