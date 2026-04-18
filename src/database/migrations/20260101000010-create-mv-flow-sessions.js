"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("mv_flow_sessions", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      flow_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: "cad_flows", key: "id" }, onDelete: "CASCADE",
      },
      customer_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: "cad_customers", key: "id" }, onDelete: "SET NULL",
      },
      phone_number:    { type: Sequelize.STRING(20), allowNull: false },
      current_node_id: { type: Sequelize.STRING(50), allowNull: true },
      status:          { type: Sequelize.STRING(20), allowNull: false, defaultValue: "active" },
      context_json:    { type: Sequelize.TEXT("long"), allowNull: true },
      history_json:    { type: Sequelize.TEXT("long"), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("mv_flow_sessions", ["phone_number", "status"]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("mv_flow_sessions");
  },
};
