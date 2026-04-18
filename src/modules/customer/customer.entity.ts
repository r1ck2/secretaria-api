import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_customers", timestamps: true, underscored: true })
export class Customer extends Model {
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

  @Column({ type: DataType.STRING(180), allowNull: true })
  declare email: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare phone: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare document: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare status: boolean;

  @BeforeSave
  static generateUuid(customer: Customer) {
    if (!customer.id) customer.id = uuidv4();
  }
}
