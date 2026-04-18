import { authConfig } from "@/config/auth";
import { tokenNotFoundError } from "@/modules/core/auth.errors";
import { sessionNotFoundError } from "@/modules/session/session.errors";
import { SessionService } from "@/modules/session/session.service";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

const sessionService = new SessionService();

export const checkjwt = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.headers.authorization) {
    return res.status(StatusCodes.UNAUTHORIZED).json(tokenNotFoundError());
  }

  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, authConfig.secret) as { userId: string };

    const session = await sessionService.validateSession(token);
    if (!session) return res.status(StatusCodes.UNAUTHORIZED).json(sessionNotFoundError());

    req.userId = decoded.userId;
    return next();
  } catch {
    return res.status(StatusCodes.UNAUTHORIZED).json(tokenNotFoundError());
  }
};
