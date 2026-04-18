"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("mv_appointments", {
      id:             { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id:        { type: Sequelize.UUID, allowNull: false, references: { model: "cad_users", key: "id" }, onDelete: "CASCADE" },
      customer_id:    { type: Sequelize.UUID, allowNull: true,  references: { model: "cad_customers", key: "id" }, onDelete: "SET NULL" },
      customer_phone: { type: Sequelize.STRING(20), allowNull: false },
      calendar_event_id: { type: Sequelize.STRING(255), allowNull: false },
      title:          { type: Sequelize.STRING(200), allowNull: false },
      start_at:       { type: Sequelize.DATE, allowNull: false },
      end_at:         { type: Sequelize.DATE, allowNull: false },
      status:         { type: Sequelize.ENUM("confirmed", "cancelled"), allowNull: false, defaultValue: "confirmed" },
      created_at:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at:     { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("mv_appointments", ["user_id", "customer_phone", "status"]);
  },
  async down(queryInterface) {
    await queryInterface.dropTable("mv_appointments");
  },
};
