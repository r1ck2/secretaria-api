import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_sessions", timestamps: true, underscored: true })
export class Session extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  @Column({ type: DataType.TEXT, allowNull: false })
  token!: string;

  @Column({ type: DataType.STRING(45), allowNull: true })
  ip_address!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  user_agent!: string;

  @Column({ type: DataType.DATE, allowNull: false })
  expires_at!: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  last_activity_at!: Date;

  @BeforeSave
  static generateUuid(session: Session) {
    if (!session.id) session.id = uuidv4();
  }
}
