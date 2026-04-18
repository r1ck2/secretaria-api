import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().optional(),
    document: z.string().optional(),
    type: z.enum(["admin_master", "professional", "company"]).default("professional"),
    status: z.boolean().default(true),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    document: z.string().optional(),
    type: z.enum(["admin_master", "professional", "company"]).optional(),
    status: z.boolean().optional(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
