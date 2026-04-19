
# ALLCANCEAGENTS - API

-- Comandos
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000002-flow-default.js 2>&1 | tail -5
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000003-flow-psicologo.js 2>&1 | tail -5
npx dotenv -e .env.development -- npx sequelize-cli db:seed --seed 20260101000002-flow-default-v2.js 2>&1 | tail -5