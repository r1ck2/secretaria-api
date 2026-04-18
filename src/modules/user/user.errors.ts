import { ApplicationError } from "@/protocols";

export function emailAlreadyExistsError(): ApplicationError {
  return { name: "EmailAlreadyExistsError", message: "Email already in use." };
}

export function invalidCredentialsError(): ApplicationError {
  return { name: "InvalidCredentialsError", message: "Invalid email or password." };
}

export function inactiveUserError(): ApplicationError {
  return { name: "InactiveUserError", message: "User account is inactive." };
}

export function userNotFoundError(): ApplicationError {
  return { name: "UserNotFoundError", message: "User not found." };
}
