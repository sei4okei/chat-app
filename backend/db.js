const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'chatuser',
  password: process.env.DB_PASSWORD || 'chatpass',
  database: process.env.DB_NAME || 'chatdb',
  port: 5432,
});

module.exports = pool;
