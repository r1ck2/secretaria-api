import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function validationSchemaMiddleware(schema: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { success, error, data } = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (success) {
      req.body = data.body;
      if (data.params) req.params = data.params;
      if (data.query) req.query = data.query;
      next();
    } else {
      const { message } = fromZodError(error as ZodError);
      res.status(422).json({ name: "ValidationError", message });
    }
  };
}
