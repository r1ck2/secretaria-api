import { Sequelize } from "sequelize-typescript";
import { env } from "@/config/environment.config";
import { entitiesMap } from "@/database/entityMap";

export class DatabaseConnection {
  private conSequelize: any = null;

  constructor() {
    this._initDb();
  }

  async _initDb() {
    this.conSequelize = new Sequelize({
      dialect: "mysql",
      host: env?.DB_HOST,
      port: env?.DB_PORT,
      username: env?.DB_USER,
      password: env?.DB_PASS,
      database: env?.DB_NAME,
      models: entitiesMap,
      logging: false,
      define: {
        underscored: true,
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    });

    this.conSequelize
      .authenticate()
      .then(() => {
        console.log("Connection established successfully. 🟢");
        this._sync();
      })
      .catch((error: any) => {
        console.error("❌ Unable to connect to the database:", error);
      });
  }

  _sync() {
    this.conSequelize.sync();
    console.log("Database connected and synced. 🟣");
  }

  _disconnect() {
    this.conSequelize.close();
    console.log("Database disconnected. ❌");
  }
}
