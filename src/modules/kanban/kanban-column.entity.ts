import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { KanbanBoard } from "./kanban-board.entity";

@Table({ tableName: "cad_kanban_columns", timestamps: true, underscored: true })
export class KanbanColumn extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => KanbanBoard)
  @Column({ type: DataType.UUID, allowNull: false })
  declare board_id: string;

  @BelongsTo(() => KanbanBoard)
  declare board: KanbanBoard;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare name: string;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare position: number;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare color: string;

  @BeforeSave
  static generateUuid(c: KanbanColumn) { if (!c.id) c.id = uuidv4(); }
}
