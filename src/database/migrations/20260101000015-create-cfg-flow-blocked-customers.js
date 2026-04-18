"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cfg_flow_blocked_customers", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "cad_users", key: "id" },
        onDelete: "CASCADE",
      },
      // Phone stored normalized (digits only) for consistent matching
      phone: { type: Sequelize.STRING(30), allowNull: false },
      reason: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("cfg_flow_blocked_customers", ["user_id", "phone"], {
      unique: true,
      name: "uq_flow_blocked_user_phone",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cfg_flow_blocked_customers");
  },
};
