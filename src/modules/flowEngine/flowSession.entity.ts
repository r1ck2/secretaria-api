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
  id!: string;

  @ForeignKey(() => Flow)
  @Column({ type: DataType.UUID, allowNull: false })
  flow_id!: string;

  @BelongsTo(() => Flow)
  flow!: Flow;

  @ForeignKey(() => Customer)
  @Column({ type: DataType.UUID, allowNull: true })
  customer_id!: string;

  @BelongsTo(() => Customer)
  customer!: Customer;

  /** Phone number that triggered the flow */
  @Column({ type: DataType.STRING(20), allowNull: false })
  phone_number!: string;

  /** ID of the node currently being processed or waiting for input */
  @Column({ type: DataType.STRING(50), allowNull: true })
  current_node_id!: string;

  /** active | waiting_input | completed | error */
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "active" })
  status!: SessionStatus;

  /**
   * Accumulated context JSON — grows as nodes execute.
   * e.g. { name, phone, intent, slots, appointment, ai_response }
   */
  @Column({ type: DataType.TEXT("long"), allowNull: true })
  context_json!: string;

  /**
   * Full message history for the AI (Responses API previous_response_id chain).
   * Stored as JSON array: [{ role, content, node_id, timestamp }]
   */
  @Column({ type: DataType.TEXT("long"), allowNull: true })
  history_json!: string;

  @BeforeSave
  static generateUuid(s: FlowSession) {
    if (!s.id) s.id = uuidv4();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
