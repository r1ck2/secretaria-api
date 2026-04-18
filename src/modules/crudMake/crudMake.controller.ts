import { Request, Response, NextFunction } from "express";
import { Model } from "sequelize-typescript";
import { WhereOptions, FindOptions, UpdateOptions, Op } from "sequelize";
import { StatusCodes } from "http-status-codes";
import {
  createRegisterRequestError,
  deleteRegisterRequestError,
  extractErrorDetails,
  findAllRegisterRequestError,
  NotFoundRegisterRequestError,
  updateRegisterRequestError,
} from "./crudMake.errors";
import { CrudOptions, getEntityCrudOptions } from "./options";

export abstract class CrudMakeController<T extends Model> {
  protected model: { new (): T } & typeof Model;
  protected entityOptions: CrudOptions;

  constructor(model: { new (): T } & typeof Model) {
    this.model = model;
    this.entityOptions = getEntityCrudOptions(model.name);
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const record = await this.model.create(req.body as any);
      res.status(201).json({ success: true, data: record, message: "Record created successfully" });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...createRegisterRequestError(extractErrorDetails(error)) });
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page = 1, limit = 10, parbusca = "",
        order = this.entityOptions.defaultOrderBy,
        orderType = this.entityOptions.defaultOrderDirection,
        ...filters
      } = req.query;

      const processedFilters: any = {};
      Object.keys(filters).forEach((key) => {
        const value = filters[key] as string;
        if (value === "true") processedFilters[key] = true;
        else if (value === "false") processedFilters[key] = false;
        else processedFilters[key] = value;
      });

      let whereConditions: WhereOptions | undefined;
      const searchableFields = this.entityOptions.searchableFields || [];
      const hasParbusca = parbusca && typeof parbusca === "string";
      const hasFilters = Object.keys(processedFilters).length > 0;

      if (hasParbusca && searchableFields.length > 0) {
        const searchConditions = {
          [Op.or]: searchableFields.map((field) => ({ [field]: { [Op.like]: `%${parbusca}%` } })),
        };
        whereConditions = hasFilters ? { [Op.and]: [searchConditions, processedFilters] } : searchConditions;
      } else if (hasFilters) {
        whereConditions = processedFilters;
      }

      const options: FindOptions = {
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [[String(order), String(orderType).toUpperCase() as "ASC" | "DESC"]],
        ...(whereConditions ? { where: whereConditions } : {}),
      };

      if (this.entityOptions.relations) {
        options.include = Object.entries(this.entityOptions.relations).map(([modelName, attributes]) => ({
          model: this.model.sequelize!.models[modelName],
          attributes,
        }));
      }

      const { count, rows } = await this.model.findAndCountAll(options);
      res.json({
        success: true, data: rows,
        pagination: { page: Number(page), limit: Number(limit), total: count, totalPages: Math.ceil(count / Number(limit)) },
      });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...findAllRegisterRequestError(extractErrorDetails(error)) });
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const record = await this.model.findByPk(req.params.id);
      if (!record) { res.status(404).json({ success: false, message: "Record not found" }); return; }
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...NotFoundRegisterRequestError(extractErrorDetails(error)) });
    }
  }

  async findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawConditions = req.body?.where || req.query;
      const whereConditions: any = {};
      Object.keys(rawConditions).forEach((key) => {
        const value = rawConditions[key] as string;
        if (value === "true") whereConditions[key] = true;
        else if (value === "false") whereConditions[key] = false;
        else whereConditions[key] = value;
      });
      const record = await this.model.findOne({ where: whereConditions as WhereOptions });
      if (!record) { res.status(404).json({ success: false, message: "Record not found" }); return; }
      res.json({ success: true, data: record });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...NotFoundRegisterRequestError(extractErrorDetails(error)) });
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const [updatedRows] = await this.model.update(req.body as any, { where: { id } as WhereOptions } as UpdateOptions);
      if (updatedRows === 0) { res.status(404).json({ success: false, message: "Record not found" }); return; }
      const updated = await this.model.findByPk(id);
      res.json({ success: true, data: updated, message: "Record updated successfully" });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...updateRegisterRequestError(extractErrorDetails(error)) });
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deleted = await this.model.destroy({ where: { id: req.params.id } as WhereOptions });
      if (deleted === 0) { res.status(404).json({ success: false, message: "Record not found" }); return; }
      res.json({ success: true, message: "Record deleted successfully" });
    } catch (error) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, ...deleteRegisterRequestError(extractErrorDetails(error)) });
    }
  }
}
