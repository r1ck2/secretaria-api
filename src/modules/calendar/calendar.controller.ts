import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { CalendarService } from "./calendar.service";
import { env } from "@/config/environment.config";

const calendarService = new CalendarService();

// POST /api/v1/calendar/credentials
export async function saveCredentials(req: Request, res: Response) {
  try {
    const { client_id, client_secret } = req.body;
    await calendarService.saveCredentials(req.userId!, client_id, client_secret);
    res.json({ success: true, message: "Credentials saved." });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// POST /api/v1/calendar/credentials/json
export async function saveCredentialsJson(req: Request, res: Response) {
  try {
    const { credentials_json } = req.body;
    await calendarService.saveCredentialsFromJson(req.userId!, credentials_json);
    res.json({ success: true, message: "Credentials saved from JSON." });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// GET /api/v1/calendar/status
export async function getStatus(req: Request, res: Response) {
  try {
    const status = await calendarService.getStatus(req.userId!);
    res.json({ success: true, data: status });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// GET /api/v1/calendar/auth-url
export async function getAuthUrl(req: Request, res: Response) {
  try {
    const url = await calendarService.generateAuthUrl(req.userId!);
    res.json({ success: true, url });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// GET /api/v1/calendar/callback
export async function handleCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query as { code: string; state: string };
    if (!code || !state) {
      return res.redirect(`${env.APP_WEB_URL}/panel/calendar?error=missing_params`);
    }
    await calendarService.handleCallback(state, code); // state contains CSRF-signed userId
    res.redirect(`${env.APP_WEB_URL}/panel/calendar?connected=true`);
  } catch (error: any) {
    res.redirect(`${env.APP_WEB_URL}/panel/calendar?error=true`);
  }
}

// GET /api/v1/calendar/events
export async function listEvents(req: Request, res: Response) {
  try {
    const { start_date, end_date } = req.query as { start_date: string; end_date: string };
    const events = await calendarService.listEvents(req.userId!, start_date, end_date);
    res.json({ success: true, data: events });
  } catch (error: any) {
    const status = error.name === "CalendarNotAuthenticated" || error.name === "CalendarCredentialsNotFound"
      ? StatusCodes.UNAUTHORIZED
      : StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({ success: false, message: error.message, name: error.name });
  }
}

// POST /api/v1/calendar/events
export async function createEvent(req: Request, res: Response) {
  try {
    const event = await calendarService.createEvent(req.userId!, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: event });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// DELETE /api/v1/calendar/events/:eventId
export async function cancelEvent(req: Request, res: Response) {
  try {
    await calendarService.cancelEvent(req.userId!, req.params.eventId);
    res.json({ success: true, message: "Event cancelled." });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}

// DELETE /api/v1/calendar/disconnect
export async function disconnectCalendar(req: Request, res: Response) {
  try {
    await calendarService.disconnect(req.userId!);
    res.json({ success: true, message: "Google Calendar disconnected." });
  } catch (error: any) {
    res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
}
