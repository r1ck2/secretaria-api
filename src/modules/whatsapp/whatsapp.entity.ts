import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Agent } from "@/modules/agent/agent.entity";

@Table({ tableName: "cad_whatsapp_connections", timestamps: true, underscored: true })
export class WhatsappConnection extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @ForeignKey(() => Agent)
  @Column({ type: DataType.UUID, allowNull: true })
  declare agent_id: string;

  @BelongsTo(() => Agent)
  declare agent: Agent;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare phone_number: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare evolution_instance_name: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare evolution_instance_apikey: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare qr_code_base64: string | null;

  @Column({ type: DataType.ENUM("pending", "connected", "disconnected"), allowNull: false, defaultValue: "pending" })
  declare status: string;

  @BeforeSave
  static generateUuid(conn: WhatsappConnection) {
    if (!conn.id) conn.id = uuidv4();
  }
}
