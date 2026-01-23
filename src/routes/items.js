const express = require("express");
const { pool } = require("../db");

const router = express.Router();

function parseQuantity(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const qty = Number(value);
  return Number.isInteger(qty) ? qty : NaN;
}

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM items ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const quantity = parseQuantity(req.body?.quantity, 1);
    if (!Number.isInteger(quantity) || quantity < 0) {
      res.status(400).json({ error: "quantity must be an integer >= 0" });
      return;
    }

    const location = req.body?.location ? String(req.body.location) : null;
    const notes = req.body?.notes ? String(req.body.notes) : null;

    const result = await pool.query(
      "INSERT INTO items (name, quantity, location, notes) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, quantity, location, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const quantity = parseQuantity(req.body?.quantity, NaN);
    if (!Number.isInteger(quantity) || quantity < 0) {
      res.status(400).json({ error: "quantity must be an integer >= 0" });
      return;
    }

    const location = req.body?.location ? String(req.body.location) : null;
    const notes = req.body?.notes ? String(req.body.notes) : null;

    const result = await pool.query(
      "UPDATE items SET name = $1, quantity = $2, location = $3, notes = $4, updated_at = now() WHERE id = $5 RETURNING *",
      [name, quantity, location, notes, id]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "item not found" });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }

    const result = await pool.query("DELETE FROM items WHERE id = $1 RETURNING id", [id]);
    if (!result.rows.length) {
      res.status(404).json({ error: "item not found" });
      return;
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
