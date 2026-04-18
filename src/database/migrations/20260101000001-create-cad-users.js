"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_users", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      email: { type: Sequelize.STRING(180), allowNull: false, unique: true },
      phone: { type: Sequelize.STRING(20), allowNull: true },
      document: { type: Sequelize.STRING(20), allowNull: true },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      type: { type: Sequelize.ENUM("admin_master", "professional", "company"), allowNull: false, defaultValue: "professional" },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("cad_users");
  },
};
