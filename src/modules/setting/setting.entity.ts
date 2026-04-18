import { Table, Column, DataType, Model, PrimaryKey, BeforeSave } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

@Table({ tableName: "cad_settings", timestamps: true, underscored: true })
export class Setting extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  /** null for admin-global settings */
  @Column({ type: DataType.UUID, allowNull: true })
  user_id!: string;

  /** true = global admin setting (user_id is null) */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_admin!: boolean;

  @Column({ type: DataType.STRING(100), allowNull: false })
  key!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  value!: string;

  @BeforeSave
  static generateUuid(setting: Setting) {
    if (!setting.id) setting.id = uuidv4();
  }
}
