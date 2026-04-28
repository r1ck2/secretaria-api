// Types and interfaces for the Professional Audio Assistant feature

// ─── Evolution API Payload Types ─────────────────────────────────────────────

export interface EvolutionAudioMessage {
  url?: string;
  mediaUrl?: string;
  base64?: string;
  mimetype?: string;
  seconds?: number;
}

export interface EvolutionDocumentMessage {
  url?: string;
  mediaUrl?: string;
  base64?: string;
  mimetype?: string;
  fileName?: string;
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
      senderPn?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      audioMessage?: EvolutionAudioMessage;
      pttMessage?: EvolutionAudioMessage;
      documentMessage?: EvolutionDocumentMessage;
    };
  };
}

// ─── Audio Content ────────────────────────────────────────────────────────────

export interface AudioContent {
  /** Whether the audio is provided as a URL or base64-encoded string */
  type: 'url' | 'base64';
  /** URL string or base64 string */
  value: string;
  /** e.g. 'audio/ogg' */
  mimeType: string;
  /** e.g. 'audio.ogg' */
  filename: string;
}

// ─── Service Entry Point ──────────────────────────────────────────────────────

export interface HandleProfessionalMessageParams {
  /** Professional's normalized phone number */
  fromNumber: string;
  /** user_id from WhatsappConnection */
  professionalUserId: string;
  /** Evolution instance name */
  instanceName: string;
  /** Evolution instance API key */
  instanceApikey: string;
  /** Full Evolution webhook payload */
  rawPayload: EvolutionWebhookPayload;
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export interface AIOrchestrator {
  receiveMessage(params: {
    phoneNumber: string;
    message: string;
    flowId?: string;
    toNumber: string;
    professionalUserId: string;
    senderName?: string;
  }): Promise<unknown>;
}

export interface ProfessionalAssistantDependencies {
  aiOrchestrator: AIOrchestrator;
  evolutionApiService: {
    sendTextMessage(
      instanceName: string,
      instanceApikey: string,
      toNumber: string,
      message: string,
    ): Promise<void>;
  };
  logService?: {
    create(data: Record<string, unknown>): Promise<void>;
  };
}

// ─── Supported MIME Types ─────────────────────────────────────────────────────

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/wav',
] as const;

export type SupportedAudioMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];
