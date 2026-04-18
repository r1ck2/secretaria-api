import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "./auth.service";
import { SessionService } from "@/modules/session/session.service";
import {
  getMeRequestError,
  signInAuthRequestError,
  signOutRequestError,
  userNotFoundError,
  userRegistrationRequestError,
} from "./auth.errors";
import {
  emailAlreadyExistsError,
  inactiveUserError,
  invalidCredentialsError,
} from "@/modules/user/user.errors";

const authService = new AuthService();
const sessionService = new SessionService();

export async function signIn(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const result = await authService.signIn(email, password);
    const session = await sessionService.createSession(result.user, req.ip || "", req.headers["user-agent"] || "");

    res.json({
      success: true,
      message: "Login successful",
      user: result.user,
      token: session.token,
      refreshToken: result.refreshToken,
    });
  } catch (error: any) {
    if (error?.name === "InvalidCredentialsError")
      return res.status(StatusCodes.UNAUTHORIZED).json(invalidCredentialsError());
    if (error?.name === "InactiveUserError")
      return res.status(StatusCodes.FORBIDDEN).json(inactiveUserError());
    if (error?.name === "UserNotFoundError")
      return res.status(StatusCodes.NOT_FOUND).json(userNotFoundError());
    return res.status(StatusCodes.BAD_REQUEST).json(signInAuthRequestError());
  }
}

export async function signUp(req: Request, res: Response) {
  try {
    const result = await authService.signUp(req.body);
    const session = await sessionService.createSession(result.user, req.ip || "", req.headers["user-agent"] || "");

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Registration successful",
      user: result.user,
      token: session.token,
    });
  } catch (error: any) {
    if (error?.name === "EmailAlreadyExistsError")
      return res.status(StatusCodes.CONFLICT).json(emailAlreadyExistsError());
    return res.status(StatusCodes.BAD_REQUEST).json(userRegistrationRequestError());
  }
}

export async function getMe(req: Request, res: Response) {
  try {
    const result = await authService.getMe(req.userId as string);
    return res.status(StatusCodes.OK).json({ success: true, ...result });
  } catch (error: any) {
    if (error?.name === "UserNotFoundError")
      return res.status(StatusCodes.NOT_FOUND).json(userNotFoundError());
    if (error?.name === "InactiveUserError")
      return res.status(StatusCodes.FORBIDDEN).json(inactiveUserError());
    return res.status(StatusCodes.BAD_REQUEST).json(getMeRequestError());
  }
}

export async function signOut(req: Request, res: Response) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) await sessionService.invalidateSession(token);
    return res.status(StatusCodes.OK).json({ success: true, message: "Logged out successfully" });
  } catch {
    return res.status(StatusCodes.BAD_REQUEST).json(signOutRequestError());
  }
}
