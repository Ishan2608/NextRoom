var MyApp = (function () {
  var socket;
  var userID;
  var roomID;

  function init(uid, roomId) {
    userID = uid;
    roomID = roomId;
    event_process_for_signaling_server();
  }

  function addUser(other_user_id, conn_id) {
    console.log(`User ${other_user_id} joined`);

    var newJoinee = $("<div>", {
      id: conn_id,
      class: "joinee other",
    }).append(
      $("<img>", {
        class: "joinee-pic",
        alt: "",
      }),
      $("<h3>").text(other_user_id),
      $("<video>", {
        id: "v_" + conn_id,
        autoplay: true,
        playsinline: true,
        style: "display: none;",
      }),
      $("<audio>", {
        id: "a_" + conn_id,
        autoplay: true,
      }),
    );

    console.log("Appending new joinee to #joinees-horizontal");
    $("#joinees-horizontal").append(newJoinee);
    console.log("Total joinees:", $("#joinees-horizontal .joinee").length);
  }

  function event_process_for_signaling_server() {
    console.log("event_process_for_signaling_server called");
    console.log("userID:", userID, "roomID:", roomID);

    socket = io.connect();

    socket.on("connect", function () {
      console.log("Socket Connected to Client-Side " + socket.id);
      console.log("socket.connected:", socket.connected);
      console.log("Checking userID and roomID:", userID, roomID);

      if (socket.connected) {
        if (userID !== "" && roomID !== "") {
          console.log("About to emit userconnect with:", {
            displayName: userID,
            roomID: roomID,
          });

          socket.emit("userconnect", {
            displayName: userID,
            roomID: roomID,
          });

          console.log("userconnect event emitted");
        } else {
          console.error(
            "userID or roomID is empty! userID:",
            userID,
            "roomID:",
            roomID,
          );
        }
      } else {
        console.error("Socket not connected!");
      }
    });

    socket.on("newuser_joined", (data) => {
      console.log("newuser_joined event received:", data);
      addUser(data.other_user_id, data.conn_id);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected. Reason:", reason);
    });
  }

  return {
    _init: function (uid, roomID) {
      init(uid, roomID);
    },
  };
})();
