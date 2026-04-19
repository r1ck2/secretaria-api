"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the FK constraint first
    await queryInterface.removeConstraint(
      "mv_flow_sessions",
      "mv_flow_sessions_ibfk_1"
    );

    // Make flow_id nullable (no FK)
    await queryInterface.changeColumn("mv_flow_sessions", "flow_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Restore NOT NULL
    await queryInterface.changeColumn("mv_flow_sessions", "flow_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });

    // Restore FK
    await queryInterface.addConstraint("mv_flow_sessions", {
      fields: ["flow_id"],
      type: "foreign key",
      name: "mv_flow_sessions_ibfk_1",
      references: { table: "cad_flows", field: "id" },
      onDelete: "CASCADE",
    });
  },
};
