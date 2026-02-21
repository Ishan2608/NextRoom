const express = require("express");
const path = require("path");
const socket = require("socket.io");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

// ─────────────────────────────────────────────
// EXPRESS SETUP
// ─────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─────────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────────
// Simple explanation: SQLite is a database that lives in a single file on your
//   hard drive (nextroom.db). Unlike MongoDB or PostgreSQL, it needs no service
//   running in the background — it just works, like a smart spreadsheet file.
// Technical: better-sqlite3 is a synchronous SQLite driver for Node.js.
//   The DB file is created automatically in your project root on first run.
const db = new Database("nextroom.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname  TEXT NOT NULL,
    email     TEXT NOT NULL UNIQUE,
    password  TEXT NOT NULL,
    createdAt TEXT NOT NULL
  )
`);

console.log("SQLite ready → nextroom.db");

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

// POST /api/signup
// Simple explanation: Take name/email/password → hash the password so it's
//   never stored as plain text → insert a new row into the users table.
// Technical: bcrypt.hash(password, 10) runs 2^10 rounds of hashing.
//   The salt is embedded in the resulting string, so bcrypt.compare() can
//   verify it later without us ever storing the original password.
app.post("/api/signup", async (req, res) => {
  const { fullname, email, password } = req.body;

  if (!fullname || !email || !password) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);

    db.prepare(
      "INSERT INTO users (fullname, email, password, createdAt) VALUES (?, ?, ?, ?)",
    ).run(
      fullname.trim(),
      email.trim().toLowerCase(),
      hashed,
      new Date().toISOString(),
    );

    return res
      .status(201)
      .json({ success: true, displayName: fullname.trim() });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// POST /api/signin
// Simple explanation: Find the user by email → compare the entered password
//   to the stored hash → if they match, let them in.
// Technical: bcrypt.compare() extracts the salt from the stored hash,
//   re-hashes the input, and checks if they match — it never "decrypts".
app.post("/api/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.trim().toLowerCase());

    if (!user) {
      // Intentionally vague — never reveal whether an email exists
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.status(200).json({ success: true, displayName: user.fullname });
  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ error: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────
// SOCKET.IO — ROOM SIGNALING
// ─────────────────────────────────────────────
var server = app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

var io = socket(server);
var userConnection = [];

io.on("connection", (socket) => {
  console.log("Socket connected: " + socket.id);

  socket.on("userconnect", (data) => {
    console.log(`userconnect: ${data.displayName} → room ${data.roomID}`);

    var others = userConnection.filter((u) => u.meeting_id === data.roomID);

    // Tell the new user about every person already in the room
    others.forEach((u) => {
      socket.emit("newuser_joined", {
        other_user_id: u.user_id,
        conn_id: u.connectionID,
      });
    });

    userConnection.push({
      connectionID: socket.id,
      user_id: data.displayName,
      meeting_id: data.roomID,
    });

    // Tell everyone already in the room about the new user
    others.forEach((u) => {
      socket.to(u.connectionID).emit("newuser_joined", {
        other_user_id: data.displayName,
        conn_id: socket.id,
      });
    });
  });

  socket.on("SDP_Process", (data) => {
    socket.to(data.to_connId).emit("SDP_Process", {
      message: data.message,
      from_connId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    userConnection = userConnection.filter((u) => u.connectionID !== socket.id);
    console.log("Socket disconnected: " + socket.id);
  });
});
