import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { AdminAgent } from "@/modules/adminAgent/adminAgent.entity";

@Table({ tableName: "cad_flows", timestamps: true, underscored: true })
export class Flow extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.STRING(120), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare status: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare is_visible_to_professional: boolean;

  @ForeignKey(() => AdminAgent)
  @Column({ type: DataType.UUID, allowNull: true })
  declare admin_agent_id: string | null;

  @BelongsTo(() => AdminAgent)
  declare admin_agent: AdminAgent;

  @Column({ type: DataType.TEXT("long"), allowNull: true })
  declare flow_json: string;

  @BeforeSave
  static generateUuid(flow: Flow) {
    if (!flow.id) flow.id = uuidv4();
  }
}
