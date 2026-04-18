import { User, Session, Customer, Agent, Setting, GoogleCredential, WhatsappConnection, Flow, FlowSession, KanbanBoard, KanbanColumn, KanbanCard, Appointment, ProfessionalActiveFlow, FlowBlockedCustomer, AdminAgent } from "@/entities";
import { Log } from "@/modules/log/log.entity";

export const entitiesMap = [
  User, Session, Customer, Agent, Setting,
  GoogleCredential, WhatsappConnection,
  Flow, FlowSession,
  KanbanBoard, KanbanColumn, KanbanCard,
  Appointment,
  ProfessionalActiveFlow,
  FlowBlockedCustomer,
  AdminAgent,
  Log,
];
