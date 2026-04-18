"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_logs", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: true, references: { model: "cad_users", key: "id" }, onDelete: "SET NULL" },
      level: { type: Sequelize.ENUM("debug", "info", "warn", "error"), allowNull: false, defaultValue: "info" },
      module: { type: Sequelize.STRING(100), allowNull: false },
      action: { type: Sequelize.STRING(100), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      metadata: { type: Sequelize.JSON, allowNull: true },
      phone_number: { type: Sequelize.STRING(20), allowNull: true },
      flow_id: { type: Sequelize.UUID, allowNull: true, references: { model: "cad_flows", key: "id" }, onDelete: "SET NULL" },
      session_id: { type: Sequelize.UUID, allowNull: true },
      error_stack: { type: Sequelize.TEXT, allowNull: true },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    // Add indexes for better performance
    await queryInterface.addIndex("cad_logs", ["user_id"]);
    await queryInterface.addIndex("cad_logs", ["level"]);
    await queryInterface.addIndex("cad_logs", ["module"]);
    await queryInterface.addIndex("cad_logs", ["phone_number"]);
    await queryInterface.addIndex("cad_logs", ["flow_id"]);
    await queryInterface.addIndex("cad_logs", ["session_id"]);
    await queryInterface.addIndex("cad_logs", ["created_at"]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("cad_logs");
  },
};