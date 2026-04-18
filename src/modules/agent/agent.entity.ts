import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

// Models supported by the Responses API (updated 2025)
export const agentModels = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
  "o3-mini",
];

@Table({ tableName: "cad_agents", timestamps: true, underscored: true })
export class Agent extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  // ── Identity ────────────────────────────────────────────────────────────────

  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "gpt-4o-mini" })
  model!: string;

  // ── Responses API core fields ────────────────────────────────────────────────

  /** Maps to `instructions` in the Responses API */
  @Column({ type: DataType.TEXT, allowNull: true })
  system_prompt!: string;

  /** 0–2 range (Responses API allows up to 2) */
  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 1.0 })
  temperature!: number;

  /** Nucleus sampling — 0–1 */
  @Column({ type: DataType.FLOAT, allowNull: true })
  top_p!: number;

  /** Max tokens in the response output */
  @Column({ type: DataType.INTEGER, allowNull: true })
  max_output_tokens!: number;

  /**
   * Whether to store the response on OpenAI servers (30-day retention).
   * Required to use `previous_response_id` for conversation continuity.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  store!: boolean;

  /**
   * How to handle context window overflow.
   * "auto" = truncate oldest messages | "disabled" = error if exceeded
   */
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "auto" })
  truncation!: string;

  /**
   * JSON array of enabled tools, e.g. ["web_search_preview", "code_interpreter"]
   * Stored as TEXT, parsed at runtime.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  tools_json!: string;

  /**
   * JSON object for free-form metadata tags.
   * Useful to identify the agent in OpenAI dashboard logs.
   * e.g. { "agent_name": "Assistente Psicólogo", "user_id": "..." }
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  metadata_json!: string;

  // ── Credentials ──────────────────────────────────────────────────────────────

  /** Per-user OpenAI API key — masked in toJSON() */
  @Column({ type: DataType.STRING(255), allowNull: true })
  openai_api_key!: string;

  // ── Status ───────────────────────────────────────────────────────────────────

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  status!: boolean;

  @BeforeSave
  static generateUuid(agent: Agent) {
    if (!agent.id) agent.id = uuidv4();
  }

  toJSON() {
    const attrs = { ...this.get() };
    // Never expose the full API key
    if (attrs.openai_api_key) {
      attrs.openai_api_key = "***" + attrs.openai_api_key.slice(-4);
    }
    return attrs;
  }
}
