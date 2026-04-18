import { Router, Request, Response } from "express";
import { CrudMakeFactory } from "@/modules/crudMake/crudMake.factory";
import { User } from "@/entities";
import { checkjwt } from "@/middlewares/jwt.middleware";
import { requireAdminMaster } from "@/middlewares/authorization.middleware";
import { validationSchemaMiddleware } from "@/middlewares/validationSchema.middleware";
import { createUserSchema, updateUserSchema } from "@/modules/user/user.schema";
import { StatusCodes } from "http-status-codes";

const router = Router();

/**
 * PATCH /api/v1/users/me
 * Allows any authenticated user to update their own profile.
 * Only safe fields allowed — type and status are ignored.
 */
router.patch("/users/me", checkjwt, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, email, phone, document, password } = req.body;

    const user = await User.findByPk(userId);
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: "User not found." });

    // Only allow safe profile fields — never allow changing type or status via this route
    const updates: any = {};
    if (name !== undefined)     updates.name = name;
    if (email !== undefined)    updates.email = email;
    if (phone !== undefined)    updates.phone = phone;
    if (document !== undefined) updates.document = document;
    if (password !== undefined) updates.password = password; // entity hook hashes it

    await user.update(updates);

    return res.json({ success: true, data: user, message: "Profile updated." });
  } catch (error: any) {
    return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: error.message });
  }
});

router.use(
  "/users",
  CrudMakeFactory.createRouter(
    User,
    {
      create: [checkjwt, requireAdminMaster, validationSchemaMiddleware(createUserSchema)],
      update: [checkjwt, requireAdminMaster, validationSchemaMiddleware(updateUserSchema)],
      delete: [checkjwt, requireAdminMaster],
      findAll: [checkjwt, requireAdminMaster],
      findById: [checkjwt],
    }
  )
);

export default router;
