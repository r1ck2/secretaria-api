import { ApplicationError } from "@/protocols";

export function sessionNotFoundError(): ApplicationError {
  return { name: "SessionNotFoundError", message: "Session not found or expired." };
}
