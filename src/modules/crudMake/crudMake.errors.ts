import { ApplicationError } from "@/protocols";

export function registerAlreadyExistsError(details: any): ApplicationError {
  return { name: "RegisterAlreadyExistsError", message: "Register already exists.", details };
}

export function NotFoundRegisterRequestError(details: any): ApplicationError {
  return { name: "NotFoundRegisterRequestError", message: "Register not found.", details };
}

export function findAllRegisterRequestError(details: any): ApplicationError {
  return { name: "FindAllRegisterRequestError", message: "Failed to find registers.", details };
}

export function createRegisterRequestError(details: any): ApplicationError {
  return { name: "CreateRegisterRequestError", message: "Failed to create register.", details };
}

export function updateRegisterRequestError(details: any): ApplicationError {
  return { name: "UpdateRegisterRequestError", message: "Failed to update register.", details };
}

export function deleteRegisterRequestError(details: any): ApplicationError {
  return { name: "DeleteRegisterRequestError", message: "Failed to delete register.", details };
}

export function extractErrorDetails(error: any): any {
  return {
    name: error instanceof Error ? error.name : "Unknown Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === "object" ? error : {}),
  };
}
