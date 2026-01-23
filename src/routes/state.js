const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const DEFAULT_ID = "default";

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT data FROM app_state WHERE id = $1", [DEFAULT_ID]);
    if (!result.rows.length) {
      res.json(null);
      return;
    }
    res.json(result.rows[0].data);
  } catch (err) {
    next(err);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const data = req.body;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      res.status(400).json({ error: "state must be an object" });
      return;
    }

    const result = await pool.query(
      "INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING data",
      [DEFAULT_ID, data]
    );

    res.json(result.rows[0].data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
