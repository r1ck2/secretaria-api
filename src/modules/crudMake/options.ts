export interface CrudOptions {
  searchableFields?: string[];
  defaultOrderBy?: string;
  defaultOrderDirection?: "ASC" | "DESC";
  relations?: Record<string, string[]>;
}

export const EntitySearchOptions: Record<string, CrudOptions> = {
  User: {
    searchableFields: ["name", "email", "type", "document"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  Customer: {
    searchableFields: ["name", "email", "phone", "document"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  Agent: {
    searchableFields: ["name", "model"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  Setting: {
    searchableFields: ["key", "value"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  Flow: {
    searchableFields: ["name", "description"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  AdminAgent: {
    searchableFields: ["name", "model"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  WhatsappConnection: {
    searchableFields: ["phone_number", "status"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
  Default: {
    searchableFields: ["name", "title", "description"],
    defaultOrderBy: "created_at",
    defaultOrderDirection: "DESC",
  },
};

export function getEntityCrudOptions(entityName: string): CrudOptions {
  return EntitySearchOptions[entityName] || EntitySearchOptions.Default;
}
