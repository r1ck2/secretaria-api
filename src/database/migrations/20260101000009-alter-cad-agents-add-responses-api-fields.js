"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable("cad_agents");

    // Add each column only if it doesn't already exist
    if (!tableDesc.top_p) {
      await queryInterface.addColumn("cad_agents", "top_p", {
        type: Sequelize.FLOAT,
        allowNull: true,
        after: "temperature",
      });
    }
    if (!tableDesc.max_output_tokens) {
      await queryInterface.addColumn("cad_agents", "max_output_tokens", {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: "top_p",
      });
    }
    if (!tableDesc.store) {
      await queryInterface.addColumn("cad_agents", "store", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        after: "max_output_tokens",
      });
    }
    if (!tableDesc.truncation) {
      await queryInterface.addColumn("cad_agents", "truncation", {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "auto",
        after: "store",
      });
    }
    if (!tableDesc.tools_json) {
      await queryInterface.addColumn("cad_agents", "tools_json", {
        type: Sequelize.TEXT,
        allowNull: true,
        after: "truncation",
      });
    }
    if (!tableDesc.metadata_json) {
      await queryInterface.addColumn("cad_agents", "metadata_json", {
        type: Sequelize.TEXT,
        allowNull: true,
        after: "tools_json",
      });
    }

    // Also widen model column from ENUM to STRING to support new models
    if (tableDesc.model && tableDesc.model.type.includes("ENUM")) {
      await queryInterface.changeColumn("cad_agents", "model", {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "gpt-4o-mini",
      });
    }

    // Fix temperature default from 0.7 to 1.0
    await queryInterface.changeColumn("cad_agents", "temperature", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
    });
  },

  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable("cad_agents");

    if (tableDesc.top_p)            await queryInterface.removeColumn("cad_agents", "top_p");
    if (tableDesc.max_output_tokens) await queryInterface.removeColumn("cad_agents", "max_output_tokens");
    if (tableDesc.store)            await queryInterface.removeColumn("cad_agents", "store");
    if (tableDesc.truncation)       await queryInterface.removeColumn("cad_agents", "truncation");
    if (tableDesc.tools_json)       await queryInterface.removeColumn("cad_agents", "tools_json");
    if (tableDesc.metadata_json)    await queryInterface.removeColumn("cad_agents", "metadata_json");

    await queryInterface.changeColumn("cad_agents", "model", {
      type: Sequelize.ENUM("gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"),
      allowNull: false,
      defaultValue: "gpt-4o-mini",
    });

    await queryInterface.changeColumn("cad_agents", "temperature", {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0.7,
    });
  },
};
