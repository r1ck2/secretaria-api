"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable("cad_flows");
    if (!desc.is_visible_to_professional) {
      await queryInterface.addColumn("cad_flows", "is_visible_to_professional", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        after: "status",
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("cad_flows", "is_visible_to_professional");
  },
};
