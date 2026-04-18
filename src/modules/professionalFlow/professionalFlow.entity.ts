import { Table, Column, DataType, Model, PrimaryKey, BeforeSave, ForeignKey, BelongsTo } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import { User } from "@/modules/user/user.entity";
import { Flow } from "@/modules/flow/flow.entity";

@Table({ tableName: "cfg_professional_active_flows", timestamps: true, underscored: true })
export class ProfessionalActiveFlow extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  id!: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  user_id!: string;

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Flow)
  @Column({ type: DataType.UUID, allowNull: false })
  flow_id!: string;

  @BelongsTo(() => Flow)
  flow!: Flow;

  @BeforeSave
  static generateUuid(record: ProfessionalActiveFlow) {
    if (!record.id) record.id = uuidv4();
  }
}
