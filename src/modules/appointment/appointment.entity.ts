import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Customer } from "@/modules/customer/customer.entity";

@Table({ tableName: "mv_appointments", timestamps: true, underscored: true })
export class Appointment extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare user_id: string;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: true })
  declare customer_id: string;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare customer_phone: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare calendar_event_id: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare title: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare start_at: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare end_at: Date;

  @Column({ type: DataType.ENUM("confirmed", "cancelled"), allowNull: false, defaultValue: "confirmed" })
  declare status: string;

  @BeforeSave
  static generateUuid(a: Appointment) { if (!a.id) a.id = uuidv4(); }
}
