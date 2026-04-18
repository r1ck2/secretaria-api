"use strict";
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash("Admin@123", 8);
    await queryInterface.bulkInsert("cad_users", [
      {
        id: uuidv4(),
        name: "Admin Master",
        email: "admin@allcanceagents.com",
        password_hash: passwordHash,
        type: "admin_master",
        status: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete("cad_users", { email: "admin@allcanceagents.com" });
  },
};
