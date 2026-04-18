import { google } from "googleapis";
import { createHash } from "crypto";
import { calendarRepository } from "./calendar.repository";
import { calendarErrors } from "./calendar.errors";
import { env } from "@/config/environment.config";

// Simple CSRF token: HMAC of userId with JWT secret so it's verifiable without storage
function makeStateToken(userId: string): string {
  return `${userId}:${createHash("sha256").update(userId + env.JWT_SECRET).digest("hex").slice(0, 16)}`;
}

function parseStateToken(state: string): string | null {
  const [userId, hash] = state.split(":");
  if (!userId || !hash) return null;
  const expected = createHash("sha256").update(userId + env.JWT_SECRET).digest("hex").slice(0, 16);
  return hash === expected ? userId : null;
}

export class CalendarService {
  // ─── OAuth client ────────────────────────────────────────────────────────────

  private async getOAuthClient(userId: string) {
    const creds = await calendarRepository.findByUserId(userId);
    if (!creds?.client_id || !creds?.client_secret) {
      throw calendarErrors.credentialsNotFound();
    }

    // Use env var — must match EXACTLY what is registered in Google Cloud Console
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    console.log("[CalendarService] Using redirect_uri:", redirectUri); // debug — remove after confirming

    const oAuth2Client = new google.auth.OAuth2(
      creds.client_id,
      creds.client_secret,
      redirectUri
    );

    if (creds.access_token) {
      oAuth2Client.setCredentials({
        access_token: creds.access_token,
        refresh_token: creds.refresh_token,
        expiry_date: creds.expiry_date ? Number(creds.expiry_date) : undefined,
      });

      // Auto-refresh: listen for new tokens and persist them
      oAuth2Client.on("tokens", async (tokens) => {
        await calendarRepository.saveTokens(
          userId,
          tokens.access_token!,
          tokens.refresh_token,
          tokens.expiry_date
        );
      });
    }

    return { oAuth2Client, creds };
  }

  // ─── Credentials ─────────────────────────────────────────────────────────────

  async saveCredentials(userId: string, clientId: string, clientSecret: string) {
    await calendarRepository.upsertManual(userId, clientId, clientSecret);
  }

  async saveCredentialsFromJson(userId: string, rawJson: string) {
    try {
      await calendarRepository.upsertFromJson(userId, rawJson);
    } catch {
      throw calendarErrors.invalidCredentialsJson();
    }
  }

  async getStatus(userId: string) {
    const creds = await calendarRepository.findByUserId(userId);
    // Never expose client_secret, access_token or refresh_token
    const maskedClientId = creds?.client_id
      ? creds.client_id.slice(0, 12) + "••••••••" + creds.client_id.slice(-6)
      : null;
    return {
      has_credentials: !!(creds?.client_id && creds?.client_secret),
      is_authenticated: !!(creds?.access_token),
      client_id_preview: maskedClientId,
      source: creds?.credentials_json ? "json" : creds?.client_id ? "manual" : null,
    };
  }

  // ─── OAuth flow ───────────────────────────────────────────────────────────────

  async generateAuthUrl(userId: string): Promise<string> {
    const { oAuth2Client } = await this.getOAuthClient(userId);
    return oAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/calendar"],
      state: makeStateToken(userId), // CSRF-safe state
    });
  }

  async handleCallback(state: string, code: string) {
    // Validate CSRF state before doing anything
    const userId = parseStateToken(state);
    if (!userId) throw new Error("Invalid or tampered OAuth state parameter.");

    const { oAuth2Client } = await this.getOAuthClient(userId);
    const { tokens } = await oAuth2Client.getToken(code);
    await calendarRepository.saveTokens(
      userId,
      tokens.access_token!,
      tokens.refresh_token,
      tokens.expiry_date
    );
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  async listEvents(userId: string, startDate: string, endDate: string) {
    const { oAuth2Client } = await this.getOAuthClient(userId);
    if (!oAuth2Client.credentials?.access_token) throw calendarErrors.notAuthenticated();

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const { data } = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });
    return data.items || [];
  }

  async createEvent(userId: string, eventData: {
    summary: string;
    description?: string;
    start_date_time: string;
    end_date_time: string;
    timezone?: string;
  }) {
    const { oAuth2Client } = await this.getOAuthClient(userId);
    if (!oAuth2Client.credentials?.access_token) throw calendarErrors.notAuthenticated();

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    const tz = eventData.timezone || "America/Sao_Paulo";

    const { data } = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: eventData.summary,
        description: eventData.description,
        start: { dateTime: eventData.start_date_time, timeZone: tz },
        end: { dateTime: eventData.end_date_time, timeZone: tz },
      },
    });
    return data;
  }

  async cancelEvent(userId: string, eventId: string) {
    const { oAuth2Client } = await this.getOAuthClient(userId);
    if (!oAuth2Client.credentials?.access_token) throw calendarErrors.notAuthenticated();

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
    await calendar.events.delete({ calendarId: "primary", eventId });
  }

  async disconnect(userId: string) {
    await calendarRepository.deleteByUserId(userId);
  }
}
