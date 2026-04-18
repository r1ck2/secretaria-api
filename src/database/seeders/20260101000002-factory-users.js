"use strict";
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const firstNames = ["Ana", "Bruno", "Carlos", "Diana", "Eduardo", "Fernanda", "Gabriel", "Helena", "Igor", "Julia", "Lucas", "Mariana", "Nicolas", "Olivia", "Pedro", "Rafaela", "Samuel", "Tatiana", "Victor", "Yasmin"];
const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa", "Ferreira", "Alves", "Rodrigues"];
const types = ["professional", "professional", "professional", "company", "company"];

module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash("Senha@123", 8);

    const users = firstNames.map((first, i) => {
      const last = lastNames[i % lastNames.length];
      const type = types[i % types.length];
      return {
        id: uuidv4(),
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@allcanceagents.com`,
        phone: `119${String(90000000 + i).padStart(8, "0")}`,
        document: String(10000000000 + i * 111111111).slice(0, 11),
        password_hash: passwordHash,
        type,
        status: i % 5 !== 0, // every 5th user is inactive
        created_at: new Date(Date.now() - i * 86400000),
        updated_at: new Date(Date.now() - i * 86400000),
      };
    });

    await queryInterface.bulkInsert("cad_users", users);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("cad_users", {
      email: { [require("sequelize").Op.like]: "%@allcanceagents.com" },
    });
  },
};
