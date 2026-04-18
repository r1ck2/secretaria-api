"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_google_credentials", {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "cad_users", key: "id" },
        onDelete: "CASCADE",
      },
      // Parsed fields — populated from manual input OR extracted from credentials_json
      client_id: { type: Sequelize.TEXT, allowNull: false },
      client_secret: { type: Sequelize.TEXT, allowNull: false },
      // Raw credentials.json content uploaded by the user
      credentials_json: { type: Sequelize.TEXT, allowNull: true },
      // OAuth tokens — populated after OAuth callback
      access_token: { type: Sequelize.TEXT, allowNull: true },
      refresh_token: { type: Sequelize.TEXT, allowNull: true },
      expiry_date: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable("cad_google_credentials");
  },
};
