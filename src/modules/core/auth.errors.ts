import { ApplicationError } from "@/protocols";

export function tokenNotFoundError(): ApplicationError {
  return { name: "TokenNotFoundError", message: "Token not found." };
}

export function userNotFoundError(): ApplicationError {
  return { name: "UserNotFoundError", message: "User not found." };
}

export function signInAuthRequestError(): ApplicationError {
  return { name: "SignInAuthRequestError", message: "An error occurred during sign-in." };
}

export function userRegistrationRequestError(): ApplicationError {
  return { name: "UserRegistrationRequestError", message: "An error occurred during registration." };
}

export function getMeRequestError(): ApplicationError {
  return { name: "GetMeRequestError", message: "An error occurred while fetching user info." };
}

export function signOutRequestError(): ApplicationError {
  return { name: "SignOutRequestError", message: "An error occurred during sign-out." };
}
