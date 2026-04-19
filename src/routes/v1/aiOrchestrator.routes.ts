import express from 'express';
import { webhookHandler, getStats, getSessions, getToolCalls, getSessionDetail, deleteSession } from '@/modules/aiOrchestrator/ai-orchestrator.controller';
import { checkjwt } from '@/middlewares/jwt.middleware';
import { requireAdminMaster } from '@/middlewares/authorization.middleware';

const router = express.Router();

router.post('/ai-orchestrator/webhook', checkjwt, webhookHandler);
router.get('/ai-orchestrator/stats', checkjwt, requireAdminMaster, getStats);
router.get('/ai-orchestrator/sessions', checkjwt, requireAdminMaster, getSessions);
router.get('/ai-orchestrator/sessions/:id', checkjwt, requireAdminMaster, getSessionDetail);
router.delete('/ai-orchestrator/sessions/:id', checkjwt, requireAdminMaster, deleteSession);
router.get('/ai-orchestrator/tool-calls', checkjwt, requireAdminMaster, getToolCalls);

export default router;
