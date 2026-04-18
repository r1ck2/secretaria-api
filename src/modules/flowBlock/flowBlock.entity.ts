import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cfg_flow_blocked_customers", timestamps: true, underscored: true })
export class FlowBlockedCustomer extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  /** Phone stored normalized — digits only */
  @Column({ type: DataType.STRING(30), allowNull: false })
  phone!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  reason!: string;

  @BeforeSave
  static generateUuid(record: FlowBlockedCustomer) {
    if (!record.id) record.id = uuidv4();
  }
}
