import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, BeforeUpdate } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { authConfig } from "@/config/auth";

export const userTypes = ["admin_master", "professional", "company"];

@Table({ tableName: "cad_users", timestamps: true, underscored: true })
export class User extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(180), allowNull: false, unique: true })
  email!: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  phone!: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  document!: string;

  @Column({ type: DataType.VIRTUAL })
  password!: string;

  @Column({ type: DataType.STRING, allowNull: false })
  password_hash!: string;

  @Column({ type: DataType.ENUM(...userTypes), allowNull: false, defaultValue: "professional" })
  type!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  status!: boolean;

  @BeforeSave
  static generateUuid(user: User) {
    if (!user.id) user.id = uuidv4();
  }

  @BeforeSave
  @BeforeUpdate
  static async hashPassword(user: User) {
    if (user.password) {
      user.password_hash = await bcrypt.hash(user.password, authConfig.bcryptSaltRounds);
    }
  }

  toJSON() {
    const attrs = { ...this.get() };
    delete attrs.password_hash;
    delete attrs.password;
    return attrs;
  }
}
