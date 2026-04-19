// Core AI Orchestrator Types

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  tool_name: string;
  status: 'success' | 'error';
  result: any;
  error?: string;
}

export interface OrchestratorResult {
  session_id: string;
  messages_sent: string[];
  tools_executed: ToolExecutionSummary[];
  status: 'completed' | 'waiting_input' | 'error';
}

export interface ToolExecutionSummary {
  tool_name: string;
  status: 'success' | 'error';
  execution_time_ms: number;
  error?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface InputMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  enum?: string[];
  description?: string;
}

export interface ParsedResponse {
  output_text: string | null;
  tool_calls: ToolCall[];
  response_id: string;
}

// Session Context Types
export interface SessionContext {
  // Identificação
  phone: string;
  customer_id?: string;
  user_id: string; // professional
  flow_id: string;
  
  // Dados do cliente
  name?: string;
  email?: string;
  is_returning_customer: boolean;
  
  // Estado da conversa
  time_of_day: string;
  last_user_message: string;
  
  // Dados temporários (slots, appointments)
  slots?: Slot[];
  chosen_slot?: Slot;
  appointments?: AppointmentSummary[];
  pending_cancel_appointment?: AppointmentSummary;
}

export interface SessionContextSchema {
  // Core identification
  phone: string;
  customer_id?: string;
  user_id: string;
  flow_id: string;
  
  // Customer data
  name?: string;
  email?: string;
  document?: string;
  is_returning_customer: boolean;
  
  // Conversation state
  time_of_day: 'bom dia' | 'boa tarde' | 'boa noite';
  last_user_message: string;
  conversation_stage?: 'greeting' | 'scheduling' | 'canceling' | 'inquiry';
  
  // Scheduling data
  slots?: Slot[];
  chosen_slot?: Slot;
  
  // Cancellation data
  appointments?: AppointmentSummary[];
  pending_cancel_appointment?: AppointmentSummary;
  
  // Registration data
  pending_registration?: {
    name?: string;
    email?: string;
    document?: string;
    step: 'name' | 'email' | 'document' | 'complete';
  };
}

export interface Slot {
  index: number;
  label: string; // "25/01/2025 às 14:00"
  start: string; // ISO 8601
  end: string; // ISO 8601
  duration_minutes: number;
}

export interface AppointmentSummary {
  id: string;
  calendar_event_id: string;
  label: string; // "25/01/2025 às 14:00"
  title: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
}

export interface HistoryEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  timestamp: string;
}

// Tool Names
export type ToolName = 
  | 'list_slots'
  | 'set_pending_slot'
  | 'book_appointment'
  | 'cancel_appointment'
  | 'create_todo'
  | 'register_customer';

// Error Types
export enum ErrorType {
  // Session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_CORRUPTED = 'SESSION_CORRUPTED',
  
  // Customer errors
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  CUSTOMER_BLOCKED = 'CUSTOMER_BLOCKED',
  
  // Agent errors
  AGENT_NOT_CONFIGURED = 'AGENT_NOT_CONFIGURED',
  OPENAI_API_ERROR = 'OPENAI_API_ERROR',
  
  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  INVALID_TOOL_PARAMETERS = 'INVALID_TOOL_PARAMETERS',
  
  // Calendar errors
  CALENDAR_NOT_CONNECTED = 'CALENDAR_NOT_CONNECTED',
  CALENDAR_API_ERROR = 'CALENDAR_API_ERROR',
  NO_SLOTS_AVAILABLE = 'NO_SLOTS_AVAILABLE',
  
  // WhatsApp errors
  WHATSAPP_SEND_ERROR = 'WHATSAPP_SEND_ERROR',
}

export interface ErrorResponse {
  error_type: ErrorType;
  message: string;
  user_message: string; // Mensagem amigável para o cliente
  metadata?: Record<string, any>;
  stack_trace?: string;
}

// Log Action Types
export enum LogAction {
  // Orchestrator events
  MESSAGE_RECEIVED = 'message_received',
  OPENAI_REQUEST = 'openai_request',
  OPENAI_RESPONSE = 'openai_response',
  TOOL_CALL_DETECTED = 'tool_call_detected',
  TOOL_EXECUTION_START = 'tool_execution_start',
  TOOL_EXECUTION_COMPLETE = 'tool_execution_complete',
  MESSAGE_SENT = 'message_sent',
  
  // Session events
  SESSION_CREATED = 'session_created',
  SESSION_UPDATED = 'session_updated',
  CONTEXT_ENRICHED = 'context_enriched',
  
  // Error events
  OPENAI_ERROR = 'openai_error',
  TOOL_ERROR = 'tool_error',
  CALENDAR_ERROR = 'calendar_error',
  WHATSAPP_ERROR = 'whatsapp_error',
  
  // Phone normalization
  PHONE_NORMALIZATION = 'phone_normalization',
  
  // Customer blocking
  CUSTOMER_BLOCKED = 'customer_blocked',
  
  // Agent selection
  AGENT_SELECTED = 'agent_selected',
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  action: LogAction;
  message: string;
  phone_number?: string;
  user_id?: string;
  flow_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}