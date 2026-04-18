import { Setting } from "@/modules/setting/setting.entity";

interface EvolutionConfig {
  baseUrl: string;
  globalApikey: string;
}

interface CreateInstanceResult {
  instanceName: string;
  apikey: string;
  qrcode_base64: string | null;
}

export class EvolutionApiService {
  private async getConfig(): Promise<EvolutionConfig> {
    const settings = await Setting.findAll({ where: { is_admin: true } });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    const baseUrl = map.evolution_base_url || "general-evolution-api.8jpqfj.easypanel.host";
    const globalApikey = map.evolution_global_apikey || "";

    return { baseUrl: baseUrl.replace(/\/$/, ""), globalApikey };
  }

  private buildUrl(baseUrl: string, path: string): string {
    const host = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
    return `${host}${path}`;
  }

  async createInstance(instanceName: string, webhookUrl: string): Promise<CreateInstanceResult> {
    const { baseUrl, globalApikey } = await this.getConfig();

    const response = await fetch(this.buildUrl(baseUrl, "/instance/create"), {
      method: "POST",
      headers: {
        apikey: globalApikey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Evolution createInstance failed: ${response.status} — ${err}`);
    }

    const data = await response.json();

    return {
      instanceName: data.instance?.instanceName || instanceName,
      apikey: data.hash?.apikey || "",
      qrcode_base64: data.qrcode?.base64 || null,
    };
  }

  async sendTextMessage(
    instanceName: string,
    instanceApikey: string,
    toNumber: string,
    text: string
  ): Promise<void> {
    const { baseUrl } = await this.getConfig();

    // Normalize number — strip non-digits
    const number = toNumber.replace(/\D/g, "");

    const response = await fetch(this.buildUrl(baseUrl, `/message/sendText/${instanceName}`), {
      method: "POST",
      headers: {
        apikey: instanceApikey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, text, delay: 1200 }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Evolution sendTextMessage failed: ${response.status} — ${err}`);
    }
  }

  async getInstanceStatus(instanceName: string, instanceApikey: string): Promise<string> {
    const { baseUrl, globalApikey } = await this.getConfig();

    // Use instance apikey if available, fall back to global apikey
    const keyToUse = instanceApikey || globalApikey;

    const response = await fetch(
      this.buildUrl(baseUrl, `/instance/connectionState/${instanceName}`),
      {
        headers: { apikey: keyToUse },
      }
    );

    if (!response.ok) return "disconnected";

    const data = await response.json() as any;
    // Evolution returns { instance: { state: "open" | "close" | "connecting" } }
    const state = data.instance?.state || data.state || "disconnected";
    if (state === "open") return "connected";
    if (state === "connecting") return "pending";
    return "disconnected";
  }

  /**
   * Fetch the instance apikey from Evolution for an existing instance.
   * Used when the instance was created outside the platform (e.g. Evolution Manager).
   * Evolution returns the token via GET /instance/fetchInstances filtered by instanceName.
   */
  async setWebhook(instanceName: string, instanceApikey: string, webhookUrl: string): Promise<void> {
    const { baseUrl, globalApikey } = await this.getConfig();
    const keyToUse = instanceApikey || globalApikey;

    const response = await fetch(this.buildUrl(baseUrl, `/webhook/set/${instanceName}`), {
      method: "POST",
      headers: { apikey: keyToUse, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Evolution setWebhook failed: ${response.status} — ${err}`);
    }
  }

  async fetchInstanceApikey(instanceName: string): Promise<{ apikey: string; phone: string | null } | null> {
    const { baseUrl, globalApikey } = await this.getConfig();

    const response = await fetch(
      this.buildUrl(baseUrl, `/instance/fetchInstances?instanceName=${instanceName}`),
      { headers: { apikey: globalApikey } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const list = Array.isArray(data) ? data : [data];
    const found = list.find((i: any) => i.name === instanceName || i.instance?.instanceName === instanceName || i.instanceName === instanceName);
    if (!found) return null;

    const apikey = found?.token || found?.instance?.token || found?.apikey || null;
    const phone = found?.ownerJid ? found.ownerJid.split("@")[0] : null;

    return apikey ? { apikey, phone } : null;
  }
}

export const evolutionApiService = new EvolutionApiService();
