import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";

export const agentModels = [
  "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini",
  "gpt-4-turbo", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini",
];

@Table({ tableName: "cad_agents", timestamps: true, underscored: true })
export class Agent extends Model {
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

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: "gpt-4o-mini" })
  declare model: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare system_prompt: string;

  @Column({ type: DataType.FLOAT, allowNull: false, defaultValue: 1.0 })
  declare temperature: number;

  @Column({ type: DataType.FLOAT, allowNull: true })
  declare top_p: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare max_output_tokens: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare store: boolean;

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "auto" })
  declare truncation: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare tools_json: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare metadata_json: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare openai_api_key: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare status: boolean;

  @BeforeSave
  static generateUuid(agent: Agent) {
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
