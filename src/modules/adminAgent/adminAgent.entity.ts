import { Table, Column, DataType, Model, PrimaryKey, BeforeSave } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

export const agentModels = [
  "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini",
  "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini",
];

@Table({ tableName: "cad_agents_admin", timestamps: true, underscored: true })
export class AdminAgent extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @Column({ type: DataType.STRING(120), allowNull: false })
  name!: string;

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "gpt-4o-mini" })
  model!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  system_prompt!: string;

  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 1.0 })
  temperature!: number;

  @Column({ type: DataType.FLOAT, allowNull: true })
  top_p!: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  max_output_tokens!: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  store!: boolean;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "auto" })
  truncation!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  tools_json!: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  metadata_json!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  openai_api_key!: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  status!: boolean;

  @BeforeSave
  static generateUuid(agent: AdminAgent) {
    if (!agent.id) agent.id = uuidv4();
  }

  toJSON() {
    const attrs = { ...this.get() };
    if (attrs.openai_api_key) {
      attrs.openai_api_key = "***" + attrs.openai_api_key.slice(-4);
    }
    return attrs;
  }
}
