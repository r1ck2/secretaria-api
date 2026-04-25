import { Table, Column, DataType, Model, PrimaryKey, BeforeSave } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

@Table({ tableName: "cad_cron_configs", timestamps: true, underscored: true })
export class CronConfig extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @Column({ type: DataType.STRING(120), allowNull: false, unique: true })
  declare job_name: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare cron_expression: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare active: boolean;

  @BeforeSave
  static generateUuid(record: CronConfig) {
    if (!record.id) record.id = uuidv4();
  }
}
