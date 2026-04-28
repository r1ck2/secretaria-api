# Requirements Document

## Introduction

This feature adds a **Professional Audio Assistant** to the clerk-agents-api platform. When the professional sends a WhatsApp message from their own registered number ("meu número"), the system must identify them as the professional (not a customer), route the message to the AI assistant flow (aiOrchestrator), and support audio messages by transcribing them via OpenAI Whisper before processing.

The feature is purely additive: no existing customer flows, FlowEngine logic, or aiOrchestrator customer-facing behavior may be modified.

## Glossary

- **Professional**: The registered user who owns the WhatsApp connection and serves customers through the platform.
- **Professional_Number**: The phone number stored in the `secretary_phone` setting for a given professional user, used to identify messages sent by the professional themselves.
- **ProfessionalAssistant**: The module (`professionalAssistant.service.ts`) responsible for handling messages identified as coming from the professional.
- **AIOrchestrator**: The existing AI-driven conversation module (`ai-orchestrator.service.ts`) that uses OpenAI GPT-4o with tool calling to respond to messages.
- **Whisper**: OpenAI's audio transcription model (`whisper-1`) used to convert audio messages to text.
- **Evolution_API**: The WhatsApp integration service used to receive and send messages.
- **Audio_Message**: A WhatsApp message containing an audio or voice note payload (not a text message).
- **Transcription**: The text output produced by Whisper from an Audio_Message.
- **FlowEngine**: The existing rule-based flow execution engine for customer interactions. Must not be modified.
- **Secretary_Phone**: A setting key (`secretary_phone`) stored per professional user that holds the Professional_Number.
- **Instance**: An Evolution API WhatsApp connection instance identified by `evolution_instance_name`.

---

## Requirements

### Requirement 1: Professional Identity Detection

**User Story:** As a professional, I want the system to recognize when I message from my own WhatsApp number, so that I am not treated as a customer and my messages are routed to my personal assistant.

#### Acceptance Criteria

1. WHEN a WhatsApp message is received via the Evolution API webhook, THE ProfessionalAssistant SHALL compare the sender's phone number against the `secretary_phone` setting for the associated professional user.
2. WHEN the sender's phone number matches the `secretary_phone` setting (comparing the last 11 digits to handle country code variations), THE ProfessionalAssistant SHALL classify the sender as the Professional.
3. WHEN the sender is classified as the Professional, THE System SHALL route the message to the professional assistant flow and SHALL NOT route it to the FlowEngine or the customer-facing AIOrchestrator flow.
4. WHEN the sender is NOT classified as the Professional, THE System SHALL continue with the existing customer routing logic without modification.
5. IF the `secretary_phone` setting is absent or empty for a professional user, THEN THE ProfessionalAssistant SHALL treat the sender as a customer and apply the existing routing logic.

---

### Requirement 2: Professional Text Message Handling via AIOrchestrator

**User Story:** As a professional, I want my text messages to be processed by the AI assistant (aiOrchestrator), so that I can ask questions and get intelligent responses about my schedule, customers, and business.

#### Acceptance Criteria

1. WHEN a text message is received from the Professional, THE ProfessionalAssistant SHALL forward the message to the AIOrchestrator for processing.
2. WHEN the AIOrchestrator processes a professional's message, THE AIOrchestrator SHALL use a dedicated professional session context that is separate from customer sessions.
3. WHEN the AIOrchestrator produces a response for the Professional, THE ProfessionalAssistant SHALL send the response back to the Professional's phone number via the Evolution API.
4. WHILE the AIOrchestrator is processing a professional's message, THE System SHALL maintain the professional's conversation history in a session scoped to the professional's own phone number.
5. IF the AIOrchestrator fails to produce a response, THEN THE ProfessionalAssistant SHALL send a fallback error message to the Professional in Portuguese.

---

### Requirement 3: Audio Message Reception and Transcription

**User Story:** As a professional, I want to send voice notes to my assistant, so that I can interact hands-free and have my audio messages understood and responded to.

#### Acceptance Criteria

1. WHEN an Audio_Message is received from the Professional via the Evolution API webhook, THE ProfessionalAssistant SHALL detect the audio payload in the Evolution API message structure.
2. WHEN an Audio_Message is detected, THE ProfessionalAssistant SHALL download the audio file from the Evolution API using the media URL or base64 content provided in the webhook payload.
3. WHEN the audio file is available, THE ProfessionalAssistant SHALL send the audio file to the OpenAI Whisper API (`whisper-1` model) for transcription.
4. WHEN the Whisper API returns a Transcription, THE ProfessionalAssistant SHALL use the Transcription text as the message content for all subsequent processing steps.
5. IF the Whisper API returns an empty or blank Transcription, THEN THE ProfessionalAssistant SHALL send a message to the Professional informing that the audio could not be understood, and SHALL NOT forward the empty text to the AIOrchestrator.
6. IF the audio download fails, THEN THE ProfessionalAssistant SHALL send an error message to the Professional in Portuguese and SHALL NOT attempt transcription.
7. IF the Whisper API call fails, THEN THE ProfessionalAssistant SHALL send an error message to the Professional in Portuguese and SHALL NOT forward the failed transcription to the AIOrchestrator.

---

### Requirement 4: Audio Transcription Forwarding to AIOrchestrator

**User Story:** As a professional, I want my transcribed voice notes to be processed by the AI assistant just like text messages, so that I get the same quality of response regardless of input format.

#### Acceptance Criteria

1. WHEN a valid Transcription is produced from an Audio_Message, THE ProfessionalAssistant SHALL forward the Transcription text to the AIOrchestrator using the same processing path as a text message.
2. WHEN forwarding a Transcription to the AIOrchestrator, THE ProfessionalAssistant SHALL include a context indicator that the original message was an audio message, so the AIOrchestrator can optionally acknowledge the audio format.
3. WHEN the AIOrchestrator processes a Transcription, THE AIOrchestrator SHALL respond to the Professional via the Evolution API using the same mechanism as for text messages.

---

### Requirement 5: Evolution API Audio Payload Handling

**User Story:** As a developer, I want the system to correctly parse Evolution API audio payloads, so that audio messages are reliably detected and their content is accessible for transcription.

#### Acceptance Criteria

1. THE ProfessionalAssistant SHALL detect audio messages by inspecting the Evolution API webhook payload for the presence of `data.message.audioMessage`, `data.message.pttMessage`, or `data.message.documentMessage` with an audio MIME type.
2. WHEN an audio payload is detected, THE ProfessionalAssistant SHALL extract the media URL or base64-encoded content from the payload fields `mediaUrl`, `base64`, or equivalent Evolution API fields.
3. WHEN the audio content is base64-encoded, THE ProfessionalAssistant SHALL decode it to a binary buffer before sending to Whisper.
4. WHEN the audio content is a URL, THE ProfessionalAssistant SHALL fetch the audio file via HTTP before sending to Whisper.
5. THE ProfessionalAssistant SHALL support audio MIME types: `audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/webm`, and `audio/wav`.

---

### Requirement 6: Non-Interference with Existing Flows

**User Story:** As a developer, I want the professional assistant feature to be purely additive, so that no existing customer flows or AI orchestrator behavior is broken.

#### Acceptance Criteria

1. THE System SHALL NOT modify the FlowEngine's `receiveMessage` method or any FlowEngine node execution logic.
2. THE System SHALL NOT modify the customer-facing AIOrchestrator's `receiveMessage` method, session management, or tool execution logic.
3. WHEN a message is identified as coming from a non-professional sender, THE System SHALL execute the existing routing logic without any change in behavior.
4. THE System SHALL implement all new professional assistant logic within the `professionalFlow` module or a new dedicated module, without altering existing module interfaces.
5. THE ProfessionalAssistant SHALL use the existing `isProfessionalOwnNumber` function as the sole gate for professional identity detection in the Evolution webhook handler.

---

### Requirement 7: Professional Session Isolation

**User Story:** As a professional, I want my assistant sessions to be isolated from customer sessions, so that my conversation history does not interfere with customer interactions.

#### Acceptance Criteria

1. THE ProfessionalAssistant SHALL create and maintain FlowSession records for the professional using the professional's own phone number as the session key.
2. WHEN creating a professional session, THE ProfessionalAssistant SHALL set a context field `is_professional: true` to distinguish it from customer sessions.
3. WHILE a professional session is active, THE System SHALL NOT allow customer messages from the same phone number to reuse the professional session.
4. THE ProfessionalAssistant SHALL pass the professional's `user_id` as the `professionalUserId` parameter when calling the AIOrchestrator, ensuring tool calls (e.g., list_slots, book_appointment) operate on the correct professional's data.

---

### Requirement 8: Whisper API Configuration

**User Story:** As a developer, I want the Whisper integration to use the existing OpenAI client infrastructure, so that API key management is consistent with the rest of the platform.

#### Acceptance Criteria

1. THE ProfessionalAssistant SHALL retrieve the OpenAI API key for Whisper transcription from the professional's configured agent (via `cad_agents` or `cad_agents_admin` tables), consistent with how the AIOrchestrator resolves API keys.
2. IF no OpenAI API key is available for the professional, THEN THE ProfessionalAssistant SHALL send an error message to the Professional indicating the assistant is not configured, and SHALL NOT attempt a Whisper API call.
3. THE ProfessionalAssistant SHALL use the `whisper-1` model for all audio transcriptions.
4. THE ProfessionalAssistant SHALL set the transcription language to Portuguese (`pt`) to improve accuracy for Brazilian Portuguese audio.
5. THE ProfessionalAssistant SHALL pass the audio file to Whisper as a `File`-compatible object with the correct MIME type and filename.
