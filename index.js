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

var userConnection = [];

io.on("connection", (socket) => {
  console.log("New user connected to socket" + socket.id);
  socket.on("userconnect", (data) => {
    console.log(
      "CLIENT:EMIT:userconnect = " + data.displayName + " and " + data.roomID,
    );

    var other_users = userConnection.filter(
      (user) => user.meeting_id === data.roomID,
    );

    // ADDED: Send list of existing users to the newly joined user
    other_users.forEach((user) => {
      socket.emit("newuser_joined", {
        other_user_id: user.user_id,
        conn_id: user.connectionID,
      });
    });

    // add the connected user to array of connected users.
    userConnection.push({
      connectionID: socket.id,
      user_id: data.displayName,
      meeting_id: data.roomID,
    });

    // Let other users know about the new user
    other_users.forEach((user) => {
      socket.to(user.connectionID).emit("newuser_joined", {
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
});
