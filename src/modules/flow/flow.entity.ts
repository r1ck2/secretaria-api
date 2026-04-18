import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { AdminAgent } from "@/modules/adminAgent/adminAgent.entity";

@Table({ tableName: "cad_flows", timestamps: true, underscored: true })
export class Flow extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  status!: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_visible_to_professional!: boolean;

  /** Optional link to an admin-managed agent — used when use_admin_agent setting is true */
  @ForeignKey(() => AdminAgent)
  @Column({ type: DataType.UUID, allowNull: true })
  admin_agent_id!: string | null;

  @BelongsTo(() => AdminAgent)
  admin_agent!: AdminAgent;

  @Column({ type: DataType.TEXT("long"), allowNull: true })
  flow_json!: string;

  @BeforeSave
  static generateUuid(flow: Flow) {
    if (!flow.id) flow.id = uuidv4();
  }
}
