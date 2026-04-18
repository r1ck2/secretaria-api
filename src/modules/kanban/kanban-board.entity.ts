import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo, HasMany } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_kanban_boards", timestamps: true, underscored: true })
export class KanbanBoard extends Model {
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

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare status: boolean;

  @BeforeSave
  static generateUuid(b: KanbanBoard) { if (!b.id) b.id = uuidv4(); }
}
