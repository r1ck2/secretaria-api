"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable("cad_flows");
    if (!desc.admin_agent_id) {
      await queryInterface.addColumn("cad_flows", "admin_agent_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "cad_agents_admin", key: "id" },
        onDelete: "SET NULL",
        after: "is_visible_to_professional",
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("cad_flows", "admin_agent_id");
  },
};
