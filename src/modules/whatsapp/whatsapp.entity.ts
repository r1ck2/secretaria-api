import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Agent } from "@/modules/agent/agent.entity";

@Table({ tableName: "cad_whatsapp_connections", timestamps: true, underscored: true })
export class WhatsappConnection extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Agent)
  @Column({ type: DataType.UUID, allowNull: true })
  agent_id!: string;

  @BelongsTo(() => Agent)
  agent!: Agent;

  @Column({ type: DataType.STRING(20), allowNull: true })
  phone_number!: string;

  @Column({ type: DataType.ENUM("pending", "connected", "disconnected"), allowNull: false, defaultValue: "pending" })
  status!: string;

  @BeforeSave
  static generateUuid(conn: WhatsappConnection) {
    if (!conn.id) conn.id = uuidv4();
  }
}
