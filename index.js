const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const path = require("path");
const cookieParser = require("cookie-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ROUTES
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

app.get("/room/:id", (req, res) => {
  // Route: <url>/room.html?meetID=<6_digit_number>
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Route not Found",
    path: req.originalUrl,
  });
});

io.on("connection", (socket) => {
  console.log(`EVENT TRIGGER:connection from socket.id=${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`EVENT TRIGGER:disconnect from socket.id=${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running at http://localhost:3000");
});
