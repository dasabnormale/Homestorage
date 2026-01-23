const fs = require("fs");
const path = require("path");
const envPath = fs.existsSync(path.join(__dirname, "..", ".ENV"))
  ? path.join(__dirname, "..", ".ENV")
  : path.join(__dirname, "..", ".env");

require("dotenv").config({ path: envPath });

const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");

const itemsRouter = require("./routes/items");
const stateRouter = require("./routes/state");

const app = express();
const port = Number(process.env.PORT || 3000);

if (process.env.REQUEST_LOG === "true") {
  app.use(morgan("dev"));
}

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN }));
}

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/items", itemsRouter);
app.use("/api/state", stateRouter);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "not found" });
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: "internal server error" });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
