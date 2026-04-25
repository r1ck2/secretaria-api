import { Table, Column, DataType, Model, PrimaryKey, BeforeSave } from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

export type QueueJobStatus = "pending" | "processing" | "done" | "failed";

@Table({ tableName: "mv_queue_jobs", timestamps: true, underscored: true })
export class QueueJob extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID })
  declare id: string;

  /** e.g. "send_appointment_reminder" */
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare job_type: string;

  @Column({ type: DataType.ENUM("pending", "processing", "done", "failed"), allowNull: false, defaultValue: "pending" })
  declare status: QueueJobStatus;

  /** JSON string with job-specific data */
  @Column({ type: DataType.TEXT("long"), allowNull: true })
  declare payload: string;

  /** When the job should be executed (null = ASAP) */
  @Column({ type: DataType.DATE, allowNull: true })
  declare scheduled_at: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare processed_at: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error_message: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare retries: number;

  @BeforeSave
  static generateUuid(record: QueueJob) {
    if (!record.id) record.id = uuidv4();
  }

  getPayload<T = any>(): T {
    try { return JSON.parse(this.payload || "{}"); }
    catch { return {} as T; }
  }
}
