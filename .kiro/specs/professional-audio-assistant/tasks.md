# Implementation Plan: Professional Audio Assistant

## Overview

Replace the existing `handleProfessionalMessage` stub in `professionalAssistant.service.ts` with a full class-based `ProfessionalAssistantService` that routes the professional's text and audio messages through `AIOrchestrator`. The only change to existing code is a single call-site swap in `triggerFlowEvolution`. All new logic is self-contained in the `professionalFlow` module.

## Tasks

- [x] 1. Define types and interfaces for the new service
  - Create `src/modules/professionalFlow/professionalAssistant.types.ts` with:
    - `HandleProfessionalMessageParams` interface
    - `AudioContent` interface (`type: 'url' | 'base64'`, `value`, `mimeType`, `filename`)
    - `EvolutionWebhookPayload`, `EvolutionAudioMessage`, `EvolutionDocumentMessage` interfaces (subset relevant to audio detection and extraction)
    - `ProfessionalAssistantDependencies` interface (`aiOrchestrator`, `evolutionApiService`, `logService`)
    - `SUPPORTED_AUDIO_MIME_TYPES` constant array (`audio/ogg`, `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/wav`)
  - _Requirements: 3.1, 5.1, 5.2, 5.5_

- [x] 2. Implement `ProfessionalAssistantService` — core class skeleton and API key resolution
  - In `src/modules/professionalFlow/professionalAssistant.service.ts`, add the `ProfessionalAssistantService` class **below** the existing `isProfessionalOwnNumber` function (keep that function unchanged)
  - Implement `resolveApiKey(professionalUserId: string): Promise<string | null>` using the same priority chain as `AIOrchestrator.selectAgent`:
    1. `selected_agent_id` setting → `cad_agents_admin`
    2. First active `cad_agents_admin`
    3. Professional's own `cad_agents`
  - Import `Agent`, `AdminAgent`, `Setting` entities
  - _Requirements: 8.1, 8.2_

- [x] 3. Implement audio detection and content extraction methods
  - Implement `isAudioMessage(payload: EvolutionWebhookPayload): boolean`
    - Returns `true` when `data.message.audioMessage`, `data.message.pttMessage`, or `data.message.documentMessage` with a supported audio MIME type is present
    - Returns `false` for all other payloads (text, non-audio documents, missing message)
  - Implement `extractAudioContent(payload: EvolutionWebhookPayload): AudioContent | null`
    - Checks `audioMessage`, then `pttMessage`, then `documentMessage` in that order
    - Extracts `url`/`mediaUrl` (prefer `mediaUrl`) or `base64` from the matched field
    - Derives `mimeType` from `mimetype` field (default `audio/ogg` if absent)
    - Derives `filename` from `documentMessage.fileName` or a sensible default (`audio.ogg`, `ptt.ogg`)
    - Returns `null` if no audio content can be extracted
  - _Requirements: 3.1, 5.1, 5.2, 5.5_

- [ ]* 3.1 Write property test for audio payload detection (Property 3)
  - File: `src/modules/professionalFlow/__tests__/professionalAssistant.properties.test.ts`
  - **Property 3: Audio payload detection**
  - Use `fc.record` arbitraries to generate payloads with `audioMessage`, `pttMessage`, and `documentMessage` (with supported MIME types) and assert `isAudioMessage` returns `true`
  - Generate payloads without these fields (or with non-audio MIME types) and assert `isAudioMessage` returns `false`
  - Tag: `// Feature: professional-audio-assistant, Property 3: Audio payload detection`
  - **Validates: Requirements 3.1, 5.1**

- [ ]* 3.2 Write property test for audio content extraction (Property 7)
  - **Property 7: Audio content extraction**
  - For any payload where `mediaUrl` or `base64` is present, assert `extractAudioContent` returns an `AudioContent` whose `value` equals the payload field and `mimeType` matches `mimetype`
  - Tag: `// Feature: professional-audio-assistant, Property 7: Audio content extraction`
  - **Validates: Requirements 5.2**

- [x] 4. Implement `resolveAudioBuffer` — download or decode audio
  - Implement `resolveAudioBuffer(content: AudioContent): Promise<Buffer>`
    - If `content.type === 'base64'`: decode with `Buffer.from(content.value, 'base64')`
    - If `content.type === 'url'`: fetch via `node-fetch` or built-in `fetch` (Node 22), throw on non-2xx HTTP status
  - Throw descriptive errors that the caller can catch and map to Portuguese user messages
  - _Requirements: 3.2, 5.3, 5.4_

- [ ]* 4.1 Write property test for base64 decode round-trip (Property 8)
  - **Property 8: Base64 decode round-trip**
  - Use `fc.uint8Array()` to generate arbitrary binary data, encode to base64, decode back, and assert byte-for-byte equality
  - Tag: `// Feature: professional-audio-assistant, Property 8: Base64 decode round-trip`
  - **Validates: Requirements 5.3**

- [x] 5. Implement `transcribeAudio` — Whisper API call
  - Implement `transcribeAudio(buffer: Buffer, mimeType: string, apiKey: string): Promise<string>`
    - Instantiate `OpenAI` with the provided `apiKey`
    - Construct a `File`-compatible object: `new File([buffer], filename, { type: mimeType })` where `filename` is derived from `mimeType` (e.g., `audio.ogg`)
    - Call `openai.audio.transcriptions.create({ model: 'whisper-1', file, language: 'pt' })`
    - Return `transcription.text`
    - Throw on API error so the caller can send the Portuguese error message
  - _Requirements: 3.3, 8.3, 8.4, 8.5_

- [ ]* 5.1 Write property test for Whisper File object format (Property 10)
  - **Property 10: Whisper File object format**
  - Use `fc.uint8Array()` and `fc.constantFrom(...SUPPORTED_AUDIO_MIME_TYPES)` to generate inputs
  - Assert the constructed `File` object has a non-empty `name` and `type` equal to the provided MIME type
  - Tag: `// Feature: professional-audio-assistant, Property 10: Whisper File object format`
  - **Validates: Requirements 8.5**

- [x] 6. Implement `handleMessage` — main entry point
  - Implement `async handleMessage(params: HandleProfessionalMessageParams): Promise<void>`
  - Logic:
    1. Resolve API key via `resolveApiKey`; if null, send Portuguese error and return
    2. Call `isAudioMessage(params.rawPayload)`
    3. **Audio path**: call `extractAudioContent` → `resolveAudioBuffer` (catch: send download error, return) → `transcribeAudio` (catch: send Whisper error, return) → blank-check transcription (if blank: send blank-audio error, return) → set `messageText = '[Áudio transcrito] ' + transcription`
    4. **Text path**: extract `messageText` from `params.rawPayload.data.message.conversation` or `extendedTextMessage.text`
    5. Call `this.deps.aiOrchestrator.receiveMessage({ phoneNumber: params.fromNumber, message: messageText, professionalUserId: params.professionalUserId, toNumber: params.fromNumber, ... })` — the `AIOrchestrator` handles session creation with `is_professional: true` injected via context (see task 7)
    6. Catch any `AIOrchestrator` error and send Portuguese fallback message
  - All error messages in Portuguese per the design error table
  - _Requirements: 2.1, 2.3, 2.5, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 8.2_

- [ ]* 6.1 Write property test for blank transcription rejection (Property 5)
  - **Property 5: Blank transcription rejection**
  - Use `fc.string().map(s => s.replace(/\S/g, ' '))` to generate whitespace-only strings (including empty string)
  - Mock `AIOrchestrator.receiveMessage` as a spy; assert it is never called when transcription is blank
  - Assert `evolutionApiService.sendTextMessage` is called with the blank-audio error message
  - Tag: `// Feature: professional-audio-assistant, Property 5: Blank transcription rejection`
  - **Validates: Requirements 3.5**

- [ ]* 6.2 Write property test for transcription forwarding (Property 4)
  - **Property 4: Transcription forwarding**
  - Use `fc.string({ minLength: 1 }).filter(s => s.trim().length > 0)` to generate valid transcriptions
  - Assert the `message` parameter passed to `AIOrchestrator.receiveMessage` contains the transcription text verbatim
  - Tag: `// Feature: professional-audio-assistant, Property 4: Transcription forwarding`
  - **Validates: Requirements 3.4, 4.1**

- [ ]* 6.3 Write property test for audio context indicator (Property 6)
  - **Property 6: Audio context indicator**
  - For any valid transcription, assert the `message` passed to `AIOrchestrator.receiveMessage` includes `[Áudio transcrito]` prefix
  - Tag: `// Feature: professional-audio-assistant, Property 6: Audio context indicator`
  - **Validates: Requirements 4.2**

- [ ]* 6.4 Write property test for MIME type acceptance (Property 9)
  - **Property 9: MIME type acceptance**
  - Use `fc.constantFrom(...SUPPORTED_AUDIO_MIME_TYPES)` — assert pipeline proceeds (no error message sent)
  - Use `fc.string().filter(s => !SUPPORTED_AUDIO_MIME_TYPES.includes(s))` — assert error message is sent and `AIOrchestrator.receiveMessage` is not called
  - Tag: `// Feature: professional-audio-assistant, Property 9: MIME type acceptance`
  - **Validates: Requirements 5.5**

- [x] 7. Inject `is_professional: true` into the professional session context
  - In `ProfessionalAssistantService.handleMessage`, after the `AIOrchestrator.receiveMessage` call resolves, verify the session was created with `is_professional: true`
  - The cleanest approach: before calling `AIOrchestrator.receiveMessage`, use `SessionManager.findOrCreateSession` to pre-create the session with `is_professional: true` in `context_json`, then pass the session's `phoneNumber` to the orchestrator so it reuses the existing session
  - Alternatively, pass `is_professional: true` as part of the message context by prepending it to the message or using a dedicated context parameter — choose the approach that requires zero changes to `AIOrchestrator`
  - No DB migration required; `context_json` is a free-form JSON column
  - _Requirements: 2.2, 2.4, 7.1, 7.2, 7.3, 7.4_

- [ ]* 7.1 Write property test for professional session isolation (Property 2)
  - **Property 2: Professional session isolation**
  - Use `fc.record({ phone: fc.string({ minLength: 11 }), userId: fc.uuid() })` to generate professional identities
  - Mock `SessionManager.findOrCreateSession` and assert it is called with the professional's phone number
  - Assert the session context contains `is_professional: true`
  - Tag: `// Feature: professional-audio-assistant, Property 2: Professional session isolation`
  - **Validates: Requirements 2.2, 2.4, 7.1, 7.2**

- [x] 8. Write unit tests for `ProfessionalAssistantService`
  - File: `src/modules/professionalFlow/__tests__/professionalAssistant.service.test.ts`
  - Mock all external dependencies: `AIOrchestrator`, `EvolutionApiService`, `OpenAI`, `fetch`, `Setting`, `Agent`, `AdminAgent`
  - Test cases:
    - Text message from professional → `AIOrchestrator.receiveMessage` called with correct `phoneNumber`, `professionalUserId`, and plain `messageText`
    - Audio message → Whisper called with `model: 'whisper-1'` and `language: 'pt'`; transcription forwarded with `[Áudio transcrito]` prefix
    - Audio download failure → Portuguese error sent, Whisper not called
    - Whisper API failure → Portuguese error sent, `AIOrchestrator.receiveMessage` not called
    - Blank transcription → Portuguese error sent, `AIOrchestrator.receiveMessage` not called
    - No API key → Portuguese error sent, Whisper not called
    - `AIOrchestrator.receiveMessage` throws → Portuguese fallback sent
    - Correct `professionalUserId` passed to `AIOrchestrator` (Requirement 7.4)
  - _Requirements: 2.1, 2.5, 3.3, 3.5, 3.6, 3.7, 7.4, 8.2, 8.3, 8.4_

- [x] 9. Checkpoint — run the test suite
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Wire `ProfessionalAssistantService` into `triggerFlowEvolution`
  - In `src/modules/flowEngine/flowEngine.controller.ts`:
    - Import `ProfessionalAssistantService` and its dependencies (`AIOrchestrator`, `EvolutionApiService`, `LogService`)
    - Instantiate `ProfessionalAssistantService` at module level (or lazily) with the existing singleton instances
    - In the `isOwnNumber` branch, replace the existing `handleProfessionalMessage` call and the manual `sendTextMessage` call with a single `await professionalAssistantService.handleMessage({ fromNumber, professionalUserId: flowUserId, instanceName: conn.evolution_instance_name, instanceApikey: conn.evolution_instance_apikey, rawPayload: payload })`
    - Remove the now-unused `handleProfessionalMessage` import
  - The `isProfessionalOwnNumber` import and call remain unchanged
  - No other changes to `triggerFlowEvolution`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 10.1 Write property test for phone suffix matching (Property 1)
  - **Property 1: Phone suffix matching**
  - File: `src/modules/professionalFlow/__tests__/professionalAssistant.properties.test.ts`
  - Use `fc.string({ minLength: 11 }).filter(s => /\d{11,}/.test(s))` for the base 11-digit suffix and `fc.string()` for an arbitrary prefix
  - Assert `isProfessionalOwnNumber` (or its synchronous suffix-comparison logic extracted for testing) returns `true` when last 11 digits match and `false` when they differ
  - Tag: `// Feature: professional-audio-assistant, Property 1: Phone suffix matching`
  - **Validates: Requirements 1.1, 1.2**

- [x] 11. Verify non-interference with existing flows
  - Confirm the existing `flowEngine.controller.test.ts` and `ai-orchestrator.integration.test.ts` suites still pass without modification
  - Confirm that messages from non-professional senders still reach `engineService.receiveMessage` unchanged
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 12. Final checkpoint — ensure all tests pass
  - Run `npm test` (vitest --run) and confirm zero failures
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- `isProfessionalOwnNumber` is never modified — it is the sole gate for professional identity detection (Requirement 6.5)
- No DB migrations are needed; `context_json` is a free-form column
- All error messages must be in Portuguese; see the design error table for exact strings
- Property tests use `fast-check` (already in `devDependencies`) with a minimum of 100 iterations per property
- The `[Áudio transcrito]` prefix satisfies both Property 4 (verbatim transcription preserved) and Property 6 (audio context indicator)
