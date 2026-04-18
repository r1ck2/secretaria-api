import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_calendar_tokens", timestamps: true, underscored: true })
export class CalendarToken extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare user_id: string;

  @BelongsTo(() => User)
  declare user: User;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare access_token: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare refresh_token: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare expires_at: Date;

  @BeforeSave
  static generateUuid(token: CalendarToken) {
    if (!token.id) token.id = uuidv4();
  }
}
