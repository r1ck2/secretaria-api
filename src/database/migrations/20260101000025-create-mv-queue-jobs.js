"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("mv_queue_jobs", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.UUIDV4 },
      job_type: { type: Sequelize.STRING(100), allowNull: false },
      status: {
        type: Sequelize.ENUM("pending", "processing", "done", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      payload: { type: Sequelize.TEXT("long"), allowNull: true },
      scheduled_at: { type: Sequelize.DATE, allowNull: true },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      retries: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("mv_queue_jobs", ["status", "scheduled_at"]);
    await queryInterface.addIndex("mv_queue_jobs", ["job_type", "status"]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("mv_queue_jobs");
  },
};
