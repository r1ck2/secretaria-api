import { Router } from "express";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { validationSchemaMiddleware } from "@/middlewares/validationSchema.middleware";
import {
  saveCredentials,
  saveCredentialsJson,
  getStatus,
  getAuthUrl,
  handleCallback,
  listEvents,
  createEvent,
  cancelEvent,
  disconnectCalendar,
} from "@/modules/calendar/calendar.controller";
import {
  saveCredentialsSchema,
  saveCredentialsJsonSchema,
  createEventSchema,
  listEventsSchema,
} from "@/modules/calendar/calendar.schema";

const router = Router();

// Credentials setup
router.post("/calendar/credentials", checkjwt, validationSchemaMiddleware(saveCredentialsSchema), saveCredentials);
router.post("/calendar/credentials/json", checkjwt, validationSchemaMiddleware(saveCredentialsJsonSchema), saveCredentialsJson);

// Status & OAuth
router.get("/calendar/status", checkjwt, getStatus);
router.get("/calendar/auth-url", checkjwt, getAuthUrl);
router.get("/calendar/callback", handleCallback); // no JWT — Google redirects here

// Events
router.get("/calendar/events", checkjwt, validationSchemaMiddleware(listEventsSchema), listEvents);
router.post("/calendar/events", checkjwt, validationSchemaMiddleware(createEventSchema), createEvent);
router.delete("/calendar/events/:eventId", checkjwt, cancelEvent);

// Disconnect
router.delete("/calendar/disconnect", checkjwt, disconnectCalendar);

export default router;
