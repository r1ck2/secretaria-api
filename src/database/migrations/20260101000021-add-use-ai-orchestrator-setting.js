'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert a global admin setting for the AI orchestrator feature toggle
    // This is a soft insert — if the key already exists, do nothing
    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM cad_settings WHERE \`key\` = 'use_ai_orchestrator' AND is_admin = true LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (!existing.length) {
      await queryInterface.bulkInsert('cad_settings', [{
        id: require('crypto').randomUUID(),
        user_id: null,
        is_admin: true,
        key: 'use_ai_orchestrator',
        value: 'false',
        created_at: new Date(),
        updated_at: new Date(),
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('cad_settings', {
      key: 'use_ai_orchestrator',
      is_admin: true,
    });
  },
};
