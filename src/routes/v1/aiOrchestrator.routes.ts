import express from 'express';
import { webhookHandler, getStats, getSessions, getToolCalls } from '@/modules/aiOrchestrator/ai-orchestrator.controller';
import { checkjwt } from '@/middlewares/jwt.middleware';
import { requireAdminMaster } from '@/middlewares/authorization.middleware';

const router = express.Router();

/**
 * POST /api/v1/ai-orchestrator/webhook
 * Receives incoming WhatsApp messages and processes them through the AI orchestrator.
 */
router.post('/ai-orchestrator/webhook', checkjwt, webhookHandler);

/**
 * GET /api/v1/ai-orchestrator/stats
 * Get AI Orchestrator statistics and metrics.
 * Restricted to admin users.
 */
router.get('/ai-orchestrator/stats', checkjwt, requireAdminMaster, getStats);

/**
 * GET /api/v1/ai-orchestrator/sessions
 * Get active AI Orchestrator sessions.
 * Restricted to admin users.
 */
router.get('/ai-orchestrator/sessions', checkjwt, requireAdminMaster, getSessions);

/**
 * GET /api/v1/ai-orchestrator/tool-calls
 * Get AI Orchestrator tool call logs.
 * Restricted to admin users.
 */
router.get('/ai-orchestrator/tool-calls', checkjwt, requireAdminMaster, getToolCalls);

export default router;
