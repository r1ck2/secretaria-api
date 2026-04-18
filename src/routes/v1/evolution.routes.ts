import { Router, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { WhatsappConnection } from "@/entities";
import { evolutionApiService } from "@/modules/evolution/evolution.service";
import { env } from "@/config/environment.config";

const router = Router();

/**
 * POST /api/v1/whatsapp/evolution/create-instance
 */
router.post("/whatsapp/evolution/create-instance", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    let conn = await WhatsappConnection.findOne({ where: { user_id: userId } });

    if (conn?.evolution_instance_name && conn?.evolution_instance_apikey) {
      return res.json({
        success: true,
        data: { instanceName: conn.evolution_instance_name, qrcode_base64: conn.qr_code_base64, status: conn.status, existing: true },
      });
    }

    const shortId = userId.replace(/-/g, "").substring(0, 8);
    const instanceName = `clerk_${shortId}`;
    const appBaseUrl = env.APP_BASE_URL || `http://localhost:${env.PORT}`;
    const webhookUrl = `${appBaseUrl}/api/v1/flow/trigger/evolution`;

    const result = await evolutionApiService.createInstance(instanceName, webhookUrl);

    if (conn) {
      await conn.update({
        evolution_instance_name: result.instanceName,
        evolution_instance_apikey: result.apikey,
        qr_code_base64: result.qrcode_base64,
        status: "pending",
      });
    } else {
      conn = await WhatsappConnection.create({
        user_id: userId,
        evolution_instance_name: result.instanceName,
        evolution_instance_apikey: result.apikey,
        qr_code_base64: result.qrcode_base64,
        status: "pending",
      } as any);
    }

    return res.json({
      success: true,
      data: { instanceName: result.instanceName, qrcode_base64: result.qrcode_base64, status: "pending", existing: false },
    });
  } catch (error: any) {
    console.error("[Evolution] create-instance error:", error.message);
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/whatsapp/evolution/status
 * Checks status, recovers apikey + phone_number, registers webhook if missing.
 */
router.get("/whatsapp/evolution/status", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const shortId = userId.replace(/-/g, "").substring(0, 8);
    const expectedInstanceName = `clerk_${shortId}`;

    let conn = await WhatsappConnection.findOne({ where: { user_id: userId }, order: [["created_at", "DESC"]] });

    if (!conn) {
      return res.json({ success: true, data: { status: "not_configured" } });
    }

    // Ensure instance name
    if (!conn.evolution_instance_name) {
      await conn.update({ evolution_instance_name: expectedInstanceName });
      conn.evolution_instance_name = expectedInstanceName;
    }

    const instanceName = conn.evolution_instance_name;

    // Always try to recover missing fields (apikey or phone_number)
    if (!conn.evolution_instance_apikey || !conn.phone_number) {
      const recovered = await evolutionApiService.fetchInstanceApikey(instanceName);
      if (recovered) {
        const updates: any = {};
        if (!conn.evolution_instance_apikey && recovered.apikey) updates.evolution_instance_apikey = recovered.apikey;
        if (!conn.phone_number && recovered.phone) updates.phone_number = recovered.phone;
        if (Object.keys(updates).length) {
          await conn.update(updates);
          if (updates.evolution_instance_apikey) conn.evolution_instance_apikey = updates.evolution_instance_apikey;
          if (updates.phone_number) conn.phone_number = updates.phone_number;
        }
      }
    }

    // Register webhook if instance exists but webhook may not be set (e.g. created via Evolution Manager)
    const appBaseUrl = env.APP_BASE_URL || `http://localhost:${env.PORT}`;
    const webhookUrl = `${appBaseUrl}/api/v1/flow/trigger/evolution`;
    try {
      await evolutionApiService.setWebhook(instanceName, conn.evolution_instance_apikey || "", webhookUrl);
    } catch (webhookErr: any) {
      console.warn("[Evolution] setWebhook failed (non-fatal):", webhookErr.message);
    }

    const status = await evolutionApiService.getInstanceStatus(instanceName, conn.evolution_instance_apikey || "");

    if (status !== conn.status) {
      await conn.update({ status });
      conn.status = status;
    }

    return res.json({
      success: true,
      data: {
        instanceName,
        status,
        phone_number: conn.phone_number,
        apikey_saved: !!conn.evolution_instance_apikey,
      },
    });
  } catch (error: any) {
    console.error("[Evolution] status error:", error.message);
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/v1/whatsapp/evolution/register-webhook
 * Admin: manually register/update the webhook URL on an instance.
 */
router.post("/whatsapp/evolution/register-webhook", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const conn = await WhatsappConnection.findOne({ where: { user_id: userId }, order: [["created_at", "DESC"]] });

    if (!conn?.evolution_instance_name) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "No instance found." });
    }

    const appBaseUrl = env.APP_BASE_URL || `http://localhost:${env.PORT}`;
    const webhookUrl = `${appBaseUrl}/api/v1/flow/trigger/evolution`;

    await evolutionApiService.setWebhook(conn.evolution_instance_name, conn.evolution_instance_apikey || "", webhookUrl);

    return res.json({ success: true, data: { webhookUrl } });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

export default router;
