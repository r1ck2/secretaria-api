import { z } from "zod";

export const saveCredentialsSchema = z.object({
  body: z.object({
    client_id: z.string().min(1, "client_id is required"),
    client_secret: z.string().min(1, "client_secret is required"),
  }),
});

export const saveCredentialsJsonSchema = z.object({
  body: z.object({
    credentials_json: z.string().min(1, "credentials_json is required"),
  }),
});

export const createEventSchema = z.object({
  body: z.object({
    summary: z.string().min(1, "Event title is required"),
    description: z.string().optional(),
    start_date_time: z.string().min(1, "Start date/time is required"),
    end_date_time: z.string().min(1, "End date/time is required"),
    timezone: z.string().default("America/Sao_Paulo"),
  }),
});

export const listEventsSchema = z.object({
  query: z.object({
    start_date: z.string().min(1, "start_date is required"),
    end_date: z.string().min(1, "end_date is required"),
  }),
});
