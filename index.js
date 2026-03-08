const http = require("http");
const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const { initSocket } = require("./socket.js");
const authRouter = require("./routes/auth.routes");
const { authMiddleware } = require("./middleware/auth.middleware");

const app = express();

// Get RAW HTTP Server
const server = http.createServer(app);

// Create Socket instance using above RAW HTTP server.
const io = new Server(server, {
  cors: { origin : "*" },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// Pass this to initialization Method.
initSocket(io);

// BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/room", authMiddleware, (req, res) => {
  // Route: <url>/room.html?meetID=<6_digit_number>
  res.sendFile(path.join(__dirname, "public", "room.html"));
});
app.use(express.static(path.join(__dirname, "public")));

// Home Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// SignIn-SignUp Page.
app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});
app.use("/auth", authRouter);

// Health Check.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// 404 Error Not Found Page.
app.use((req, res) => {
  res.status(404).json({
    error: "Route not Found",
    path: req.originalUrl,
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running at http://localhost:3000");
});
