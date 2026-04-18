import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_google_credentials", timestamps: true, underscored: true })
export class GoogleCredential extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  // Parsed fields (populated from manual input OR extracted from credentials_json)
  @Column({ type: DataType.TEXT, allowNull: false })
  client_id!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  client_secret!: string;

  // Raw credentials.json uploaded by the user (stored as TEXT/JSON string)
  @Column({ type: DataType.TEXT, allowNull: true })
  credentials_json!: string;

  // OAuth tokens (populated after OAuth callback)
  @Column({ type: DataType.TEXT, allowNull: true })
  access_token!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  refresh_token!: string;

  @Column({ type: DataType.BIGINT, allowNull: true })
  expiry_date!: number;

  @BeforeSave
  static generateUuid(instance: GoogleCredential) {
    if (!instance.id) instance.id = uuidv4();
  }
}
