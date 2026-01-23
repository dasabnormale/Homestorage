const fs = require("fs");
const path = require("path");
const envPath = fs.existsSync(path.join(__dirname, "..", ".ENV"))
  ? path.join(__dirname, "..", ".ENV")
  : path.join(__dirname, "..", ".env");

require("dotenv").config({ path: envPath });
const { pool } = require("./db");

async function run() {
  const filePath = path.join(__dirname, "migrations", "001_init.sql");
  const sql = fs.readFileSync(filePath, "utf8");
  await pool.query(sql);
  await pool.end();
}

run()
  .then(() => {
    console.log("Migration complete.");
  })
  .catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
