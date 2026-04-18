import { Router, RequestHandler } from "express";
import { Model } from "sequelize-typescript";
import { CrudMakeController } from "./crudMake.controller";
import { CrudOptions } from "./options";

class ControllerFactory<T extends Model> extends CrudMakeController<T> {
  constructor(model: { new (): T } & typeof Model) {
    super(model);
  }
}

interface CrudMiddlewares {
  create?: RequestHandler[];
  update?: RequestHandler[];
  findAll?: RequestHandler[];
  findOne?: RequestHandler[];
  findById?: RequestHandler[];
  delete?: RequestHandler[];
}

export class CrudMakeFactory {
  static createRouter<T extends Model>(
    model: { new (): T } & typeof Model,
    middlewares?: CrudMiddlewares,
    customOptions?: Partial<CrudOptions>
  ): Router {
    const controller = new ControllerFactory(model);
    if (customOptions) Object.assign(controller["entityOptions"], customOptions);

    const router = Router();
    router.post("/", ...(middlewares?.create || []), controller.create.bind(controller));
    router.get("/", ...(middlewares?.findAll || []), controller.findAll.bind(controller));
    router.get("/findOne", ...(middlewares?.findOne || []), controller.findOne.bind(controller));
    router.get("/:id", ...(middlewares?.findById || []), controller.findById.bind(controller));
    router.put("/:id", ...(middlewares?.update || []), controller.update.bind(controller));
    router.delete("/:id", ...(middlewares?.delete || []), controller.delete.bind(controller));
    return router;
  }
}
