import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Flow } from "@/modules/flow/flow.entity";

export type LogLevel = "debug" | "info" | "warn" | "error";

@Table({ tableName: "cad_logs", timestamps: true, underscored: true })
export class Log extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  declare user_id: string | null;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.ENUM("debug", "info", "warn", "error"), allowNull: false, defaultValue: "info" })
  declare level: LogLevel;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare module: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare action: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare message: string;

  @Column({ type: DataType.JSON, allowNull: true })
  declare metadata: Record<string, any> | null;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare phone_number: string | null;

  @ForeignKey(() => Flow)
  @Column({ type: DataType.UUID, allowNull: true })
  declare flow_id: string | null;

  @BelongsTo(() => Flow)
  declare flow: Flow;

  @Column({ type: DataType.UUID, allowNull: true })
  declare session_id: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error_stack: string | null;

  @Column({ type: DataType.STRING(45), allowNull: true })
  declare ip_address: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare user_agent: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare status: boolean;

  @BeforeSave
  static generateUuid(log: Log) {
    if (!log.id) log.id = uuidv4();
  }

  // Helper method to get metadata as object
  getMetadata(): Record<string, any> {
    return this.metadata || {};
  }

  // Helper method to set metadata
  setMetadata(data: Record<string, any>) {
    this.metadata = data;
  }
}