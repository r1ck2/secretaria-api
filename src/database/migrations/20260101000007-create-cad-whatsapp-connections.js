"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_whatsapp_connections", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: "cad_users", key: "id" }, onDelete: "CASCADE" },
      agent_id: { type: Sequelize.UUID, allowNull: true, references: { model: "cad_agents", key: "id" }, onDelete: "SET NULL" },
      phone_number: { type: Sequelize.STRING(20), allowNull: true },
      status: { type: Sequelize.ENUM("pending", "connected", "disconnected"), allowNull: false, defaultValue: "pending" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("cad_whatsapp_connections");
  },
};
