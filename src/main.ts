import "reflect-metadata";
import express, { Application } from "express";
import cors from "cors";
import routes from "./routes";
import http from "http";
import { DatabaseConnection } from "./config/dbConnection";
import { env } from "./config/environment.config";
import rateLimit from "express-rate-limit";

const app: Application = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: { success: false, message: "Too many requests. Try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);
}

app.use(cors({ origin: env.APP_WEB_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(routes);

const start = async () => {
  new DatabaseConnection();
  http.createServer(app).listen(env.PORT, () => {
    console.log(`AllcanceAgents API running on port ${env.PORT} 🚀`);
  });
};

start();
