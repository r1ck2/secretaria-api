import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { userRepository } from "@/modules/user/user.repository";

export const requireAdminMaster = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userRepository.findById(req.userId as string);
    if (!user || user.type !== "admin_master") {
      return res.status(StatusCodes.FORBIDDEN).json({ name: "ForbiddenError", message: "Admin Master access required." });
    }
    return next();
  } catch {
    return res.status(StatusCodes.FORBIDDEN).json({ name: "ForbiddenError", message: "Access denied." });
  }
};

export const requireProfessional = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userRepository.findById(req.userId as string);
    if (!user || !["professional", "company"].includes(user.type)) {
      return res.status(StatusCodes.FORBIDDEN).json({ name: "ForbiddenError", message: "Professional access required." });
    }
    return next();
  } catch {
    return res.status(StatusCodes.FORBIDDEN).json({ name: "ForbiddenError", message: "Access denied." });
  }
};
