"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_agents_admin", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      model: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "gpt-4o-mini" },
      system_prompt:      { type: Sequelize.TEXT, allowNull: true },
      temperature:        { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1.0 },
      top_p:              { type: Sequelize.FLOAT, allowNull: true },
      max_output_tokens:  { type: Sequelize.INTEGER, allowNull: true },
      store:              { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      truncation:         { type: Sequelize.STRING(20), allowNull: false, defaultValue: "auto" },
      tools_json:         { type: Sequelize.TEXT, allowNull: true },
      metadata_json:      { type: Sequelize.TEXT, allowNull: true },
      openai_api_key:     { type: Sequelize.STRING(255), allowNull: true },
      status:             { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("cad_agents_admin");
  },
};
