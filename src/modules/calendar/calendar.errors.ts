import { ApplicationError } from "@/protocols";

export const calendarErrors = {
  credentialsNotFound(): ApplicationError {
    return { name: "CalendarCredentialsNotFound", message: "Google credentials not configured. Please save your Client ID and Secret first." };
  },
  notAuthenticated(): ApplicationError {
    return { name: "CalendarNotAuthenticated", message: "Google Calendar not connected. Please complete the OAuth flow." };
  },
  invalidCredentialsJson(): ApplicationError {
    return { name: "InvalidCredentialsJson", message: "Invalid credentials.json file. Make sure it contains client_id and client_secret." };
  },
  listEventsFailed(): ApplicationError {
    return { name: "ListEventsFailed", message: "Failed to list calendar events." };
  },
  createEventFailed(): ApplicationError {
    return { name: "CreateEventFailed", message: "Failed to create calendar event." };
  },
  cancelEventFailed(): ApplicationError {
    return { name: "CancelEventFailed", message: "Failed to cancel calendar event." };
  },
};
