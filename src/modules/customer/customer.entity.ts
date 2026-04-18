import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_customers", timestamps: true, underscored: true })
export class Customer extends Model {
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

  @Column({ type: DataType.STRING(180), allowNull: true })
  email!: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  phone!: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  document!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  notes!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  status!: boolean;

  @BeforeSave
  static generateUuid(customer: Customer) {
    if (!customer.id) customer.id = uuidv4();
  }
}
