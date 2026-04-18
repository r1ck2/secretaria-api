"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable("cad_settings");
    if (!desc.is_admin) {
      await queryInterface.addColumn("cad_settings", "is_admin", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        after: "user_id",
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("cad_settings", "is_admin");
  },
};
