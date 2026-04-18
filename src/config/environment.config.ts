import dotenv from "dotenv";
import { join } from "path";

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
dotenv.config({ path: join(process.cwd(), envFile) });

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(2727),
  APP_WEB_URL: z.coerce.string().default("http://localhost:3000"),

  DB_USER: z.coerce.string(),
  DB_PASS: z.coerce.string(),
  DB_HOST: z.coerce.string(),
  DB_NAME: z.coerce.string(),
  DB_PORT: z.coerce.number().default(3306),

  JWT_SECRET: z.coerce.string().default("secret"),
  JWT_REFRESH_SECRET: z.coerce.string().default("refresh_secret"),
  JWT_EXPIRES_IN: z.coerce.string().default("7d"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(500),

  // Google OAuth — credentials are stored per-user in cad_google_credentials, not globally
  GOOGLE_REDIRECT_URI: z.coerce.string().default("http://localhost:2727/api/v1/calendar/callback"),

  APIBRASIL_TOKEN: z.coerce.string().optional(),
  APIBRASIL_SECRET: z.coerce.string().optional(),
});

const loadEnvironment = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error: any) {
    console.error("Invalid environment variables:", error.errors);
    process.exit(1);
  }
};

export const env = loadEnvironment();
