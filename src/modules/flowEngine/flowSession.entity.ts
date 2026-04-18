import {
  Table, Column, DataType, Model, PrimaryKey,
  BeforeSave, ForeignKey, BelongsTo,
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { Flow } from "@/modules/flow/flow.entity";
import { Customer } from "@/modules/customer/customer.entity";

export type SessionStatus = "active" | "waiting_input" | "completed" | "error";

@Table({ tableName: "mv_flow_sessions", timestamps: true, underscored: true })
export class FlowSession extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  @ForeignKey(() => Flow)
  @Column({ type: DataType.UUID, allowNull: false })
  declare flow_id: string;

  @BelongsTo(() => Flow)
  declare flow: Flow;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: true })
  declare customer_id: string;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @Column({ type: DataType.STRING(20), allowNull: false })
  declare phone_number: string;

  @Column({ type: DataType.STRING(50), allowNull: true })
  declare current_node_id: string;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "active" })
  declare status: SessionStatus;

  @Column({ type: DataType.TEXT("long"), allowNull: true })
  declare context_json: string;

  @Column({ type: DataType.TEXT("long"), allowNull: true })
  declare history_json: string;

  @BeforeSave
  static generateUuid(s: FlowSession) {
    if (!s.id) s.id = uuidv4();
  }

  getContext(): Record<string, any> {
    try { return this.context_json ? JSON.parse(this.context_json) : {}; }
    catch { return {}; }
  }

  setContext(ctx: Record<string, any>) {
    this.context_json = JSON.stringify(ctx);
  }

  getHistory(): any[] {
    try { return this.history_json ? JSON.parse(this.history_json) : []; }
    catch { return []; }
  }

  pushHistory(entry: { role: string; content: string; node_id?: string }) {
    const h = this.getHistory();
    h.push({ ...entry, timestamp: new Date().toISOString() });
    this.history_json = JSON.stringify(h);
  }
}
