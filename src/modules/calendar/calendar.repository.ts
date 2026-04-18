import { GoogleCredential } from "./google-credential.entity";

export const calendarRepository = {
  async findByUserId(userId: string): Promise<GoogleCredential | null> {
    return GoogleCredential.findOne({ where: { user_id: userId } });
  },

  /**
   * Save credentials from manual input (clientId + clientSecret).
   */
  async upsertManual(userId: string, clientId: string, clientSecret: string): Promise<void> {
    await GoogleCredential.upsert({
      user_id: userId,
      client_id: clientId,
      client_secret: clientSecret,
      credentials_json: null,
    } as any);
  },

  /**
   * Save credentials from uploaded credentials.json.
   * Extracts client_id and client_secret from the JSON automatically.
   * Supports both "web" and "installed" app types from Google Cloud Console.
   */
  async upsertFromJson(userId: string, rawJson: string): Promise<void> {
    const parsed = JSON.parse(rawJson);
    const app = parsed.web || parsed.installed;
    if (!app?.client_id || !app?.client_secret) {
      throw new Error("Invalid credentials.json: missing client_id or client_secret.");
    }
    await GoogleCredential.upsert({
      user_id: userId,
      client_id: app.client_id,
      client_secret: app.client_secret,
      credentials_json: rawJson,
    } as any);
  },

  async saveTokens(
    userId: string,
    accessToken: string,
    refreshToken: string | null | undefined,
    expiryDate: number | null | undefined
  ): Promise<void> {
    const update: any = { access_token: accessToken };
    if (refreshToken) update.refresh_token = refreshToken;
    if (expiryDate) update.expiry_date = expiryDate;
    await GoogleCredential.update(update, { where: { user_id: userId } });
  },

  async deleteByUserId(userId: string): Promise<void> {
    await GoogleCredential.destroy({ where: { user_id: userId } });
  },
};
