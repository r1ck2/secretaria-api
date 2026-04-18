"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("cad_kanban_boards", {
      id:         { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      user_id:    { type: Sequelize.UUID, allowNull: false, references: { model: "cad_users", key: "id" }, onDelete: "CASCADE" },
      name:       { type: Sequelize.STRING(120), allowNull: false },
      status:     { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable("cad_kanban_columns", {
      id:         { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      board_id:   { type: Sequelize.UUID, allowNull: false, references: { model: "cad_kanban_boards", key: "id" }, onDelete: "CASCADE" },
      name:       { type: Sequelize.STRING(80), allowNull: false },
      position:   { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      color:      { type: Sequelize.STRING(20), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.createTable("cad_kanban_cards", {
      id:          { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      board_id:    { type: Sequelize.UUID, allowNull: false, references: { model: "cad_kanban_boards", key: "id" }, onDelete: "CASCADE" },
      column_id:   { type: Sequelize.UUID, allowNull: false, references: { model: "cad_kanban_columns", key: "id" }, onDelete: "CASCADE" },
      user_id:     { type: Sequelize.UUID, allowNull: false, references: { model: "cad_users", key: "id" }, onDelete: "CASCADE" },
      title:       { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      priority:    { type: Sequelize.ENUM("low", "medium", "high"), allowNull: false, defaultValue: "medium" },
      due_date:    { type: Sequelize.DATEONLY, allowNull: true },
      position:    { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      tags:        { type: Sequelize.TEXT, allowNull: true },
      created_at:  { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at:  { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("cad_kanban_cards", ["board_id", "column_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("cad_kanban_cards");
    await queryInterface.dropTable("cad_kanban_columns");
    await queryInterface.dropTable("cad_kanban_boards");
  },
};
