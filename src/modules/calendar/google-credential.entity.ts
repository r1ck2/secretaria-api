import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_google_credentials", timestamps: true, underscored: true })
export class GoogleCredential extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare client_id: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare client_secret: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare credentials_json: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare access_token: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare refresh_token: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  declare expiry_date: number;

  @BeforeSave
  static generateUuid(instance: GoogleCredential) {
    if (!instance.id) instance.id = uuidv4();
  }
}
