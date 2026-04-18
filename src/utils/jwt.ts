import jwt from "jsonwebtoken";
import { authConfig } from "@/config/auth";

export function generateToken(params: { id?: string }) {
  return jwt.sign({ userId: params.id }, authConfig.secret, { expiresIn: authConfig.expiresIn } as any);
}

export function generateRefreshToken(user: any) {
  return jwt.sign(JSON.stringify(user), authConfig.refreshSecret);
}

export function jwtVerify(token: string) {
  return jwt.verify(token, authConfig.secret);
}
