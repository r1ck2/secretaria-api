"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable("cad_whatsapp_connections");

    if (!desc.evolution_instance_name) {
      await queryInterface.addColumn("cad_whatsapp_connections", "evolution_instance_name", {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: "phone_number",
      });
    }

    if (!desc.evolution_instance_apikey) {
      await queryInterface.addColumn("cad_whatsapp_connections", "evolution_instance_apikey", {
        type: Sequelize.STRING(255),
        allowNull: true,
        after: "evolution_instance_name",
      });
    }

    if (!desc.qr_code_base64) {
      await queryInterface.addColumn("cad_whatsapp_connections", "qr_code_base64", {
        type: Sequelize.TEXT,
        allowNull: true,
        after: "evolution_instance_apikey",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("cad_whatsapp_connections", "evolution_instance_name");
    await queryInterface.removeColumn("cad_whatsapp_connections", "evolution_instance_apikey");
    await queryInterface.removeColumn("cad_whatsapp_connections", "qr_code_base64");
  },
};
