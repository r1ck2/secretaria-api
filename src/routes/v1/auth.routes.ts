import { Router } from "express";
import { signIn, signUp, getMe, signOut } from "@/modules/core/auth.controller";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { validationSchemaMiddleware } from "@/middlewares/validationSchema.middleware";
import { SignInSchema, SignUpSchema } from "@/modules/core/schemas/auth.schema";

const router = Router();

router.post("/auth/signin", validationSchemaMiddleware(SignInSchema), signIn);
router.post("/auth/signup", validationSchemaMiddleware(SignUpSchema), signUp);
router.get("/auth/me", checkjwt, getMe);
router.post("/auth/signout", checkjwt, signOut);

export default router;
