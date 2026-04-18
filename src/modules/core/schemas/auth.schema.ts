import { z } from "zod";

export const SignInSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email."),
    password: z.string().min(8, "Password must be at least 8 characters."),
  }),
});

export const SignUpSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters."),
    email: z.string().email("Invalid email."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    phone: z.string().optional(),
    document: z.string().optional(),
    type: z.enum(["admin_master", "professional", "company"]).default("professional"),
  }),
});
