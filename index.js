const express = require("express");
const path = require("path");
const socket = require("socket.io");

const app = express();
app.use(express.static(path.join(__dirname, "")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

var server = app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

var io = socket(server);

io.on("connection", (socket) => {
  console.log("New user connected to socket" + socket.id);
});
