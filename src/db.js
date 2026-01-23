const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

const config = connectionString
  ? { connectionString }
  : {
      host: process.env.PGHOST || process.env.DB_HOST || "localhost",
      port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
      database: process.env.PGDATABASE || process.env.DB_NAME || "homestorage",
      user: process.env.PGUSER || process.env.DB_USER || "homestorage",
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD || ""
    };

const pool = new Pool(config);

module.exports = { pool };
