import express, { NextFunction, Request, Response, RequestHandler } from "express";
import authRoutes from "./v1/auth.routes";
import userRoutes from "./v1/user.routes";
import customerRoutes from "./v1/customer.routes";
import agentRoutes from "./v1/agent.routes";
import settingRoutes from "./v1/setting.routes";
import calendarRoutes from "./v1/calendar.routes";
import flowRoutes from "./v1/flow.routes";
import kanbanRoutes from "./v1/kanban.routes";
import whatsappRoutes from "./v1/whatsapp.routes";
import professionalFlowRoutes from "./v1/professionalFlow.routes";
import flowBlockRoutes from "./v1/flowBlock.routes";
import adminAgentRoutes from "./v1/adminAgent.routes";
import evolutionRoutes from "./v1/evolution.routes";
import logRoutes from "./v1/log.routes";
import aiOrchestratorRoutes from "./v1/aiOrchestrator.routes";
import appointmentRoutes from "./v1/appointment.routes";

const routes = express.Router();

const healthCheck: RequestHandler = (_req: Request, res: Response) => {
  res.status(200).json({ message: "AllcanceAgents API running 🟢 🚀" });
};

const notFoundHandler: RequestHandler = (req: Request, res: Response) => {
  res.status(404).json({ message: `Route not found: ${req.url}` });
};

routes.get("/", healthCheck);
routes.use("/api/v1", authRoutes);
routes.use("/api/v1", userRoutes);
routes.use("/api/v1", customerRoutes);
routes.use("/api/v1", agentRoutes);
routes.use("/api/v1", settingRoutes);
routes.use("/api/v1", calendarRoutes);
routes.use("/api/v1", flowRoutes);
routes.use("/api/v1", kanbanRoutes);
routes.use("/api/v1", whatsappRoutes);
routes.use("/api/v1", professionalFlowRoutes);
routes.use("/api/v1", flowBlockRoutes);
routes.use("/api/v1", adminAgentRoutes);
routes.use("/api/v1", evolutionRoutes);
routes.use("/api/v1", logRoutes);
routes.use("/api/v1", aiOrchestratorRoutes);
routes.use("/api/v1", appointmentRoutes);

routes.use(notFoundHandler);

export default routes;
