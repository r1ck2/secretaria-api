import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { KanbanBoard } from "./kanban-board.entity";
import { KanbanColumn } from "./kanban-column.entity";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_kanban_cards", timestamps: true, underscored: true })
export class KanbanCard extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => KanbanBoard)
  @Column({ type: DataType.UUID, allowNull: false })
  board_id!: string;

  @ForeignKey(() => KanbanColumn)
  @Column({ type: DataType.UUID, allowNull: false })
  column_id!: string;

  @BelongsTo(() => KanbanColumn)
  column!: KanbanColumn;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  title!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  description!: string;

  @Column({ type: DataType.ENUM("low", "medium", "high"), allowNull: false, defaultValue: "medium" })
  priority!: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  due_date!: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  position!: number;

  /** JSON array of tag strings e.g. ["urgente","cliente"] */
  @Column({ type: DataType.TEXT, allowNull: true })
  tags!: string;

  @BeforeSave
  static generateUuid(c: KanbanCard) { if (!c.id) c.id = uuidv4(); }
}
