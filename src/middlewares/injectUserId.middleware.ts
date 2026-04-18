import { NextFunction, Request, Response } from "express";

/**
 * Injects req.userId into req.body.user_id before the CrudMakeFactory create handler.
 * Use as middleware on create routes that need to auto-associate the record to the logged-in user.
 */
export const injectUserId = (req: Request, _res: Response, next: NextFunction) => {
  if (req.userId) {
    req.body.user_id = req.userId;
  }
  next();
};
