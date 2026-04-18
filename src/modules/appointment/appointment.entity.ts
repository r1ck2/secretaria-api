import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Customer } from "@/modules/customer/customer.entity";

@Table({ tableName: "mv_appointments", timestamps: true, underscored: true })
export class Appointment extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: true })
  customer_id!: string;

  @BelongsTo(() => Customer)
  customer!: Customer;

  @Column({ type: DataType.STRING(20), allowNull: false })
  customer_phone!: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  calendar_event_id!: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  title!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  start_at!: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  end_at!: Date;

  @Column({ type: DataType.ENUM("confirmed", "cancelled"), allowNull: false, defaultValue: "confirmed" })
  status!: string;

  @BeforeSave
  static generateUuid(a: Appointment) { if (!a.id) a.id = uuidv4(); }
}
