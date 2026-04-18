import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { KanbanBoard } from "./kanban-board.entity";
import { KanbanColumn } from "./kanban-column.entity";
import { User } from "@/modules/user/user.entity";

@Table({ tableName: "cad_kanban_cards", timestamps: true, underscored: true })
export class KanbanCard extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => KanbanBoard)
  @Column({ type: DataType.UUID, allowNull: false })
  declare board_id: string;

  @ForeignKey(() => KanbanColumn)
  @Column({ type: DataType.UUID, allowNull: false })
  declare column_id: string;

  @BelongsTo(() => KanbanColumn)
  declare column: KanbanColumn;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare user_id: string;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string;

  @Column({ type: DataType.ENUM("low", "medium", "high"), allowNull: false, defaultValue: "medium" })
  declare priority: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare due_date: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;

  /** JSON array of tag strings e.g. ["urgente","cliente"] */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare tags: string;

  @BeforeSave
  static generateUuid(c: KanbanCard) { if (!c.id) c.id = uuidv4(); }
}
