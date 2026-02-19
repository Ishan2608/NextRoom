// MANAGE PEER-PEER TO CONNECTION
var AppProcess = (function () {
  var peers_conn_ids = [];
  var peers_connections = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];
  var serverProcess;
  var iceConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  async function _init(SDP_function, myconn_id) {
    console.log("Initializing AppProcess...");
    serverProcess = SDP_function;
    my_connection_id = myconn_id;
    // Initialize any necessary variables or resources here
  }

  async function setConnection(conn_id) {
    console.log("Setting Connection with Peer: " + conn_id);
    var connection = new RTCPeerConnection(iceConfig);

    connection.onnegotiationneeded = async (event) => {
      await setOffer(conn_id);
    };
    connection.onicecandidate = function (event) {
      if (event.candidate) {
        serverProcess(
          JSON.stringify({ icecandidate: event.candidate }),
          conn_id,
        );
      }
    };
    connection.ontrack = function (event) {
      console.log("Received track from peer");
      if (!remote_vid_stream[conn_id]) {
        remote_vid_stream[conn_id] = new MediaStream();
      }
      if (!remote_aud_stream[conn_id]) {
        remote_aud_stream[conn_id] = new MediaStream();
      }
      if (event.track.kind == "video") {
        remote_vid_stream[conn_id].getVideoTracks().forEach((t) => {
          remote_vid_stream[conn_id].removeTrack(t);
        });
        remote_vid_stream[conn_id].addTrack(event.track);
        var remoteVideoPlayer = document.getElementById("v_" + conn_id);
        remoteVideoPlayer.srcObject = null;
        remoteVideoPlayer.srcObject = remote_vid_stream[conn_id];
        remoteVideoPlayer.load();
      } else if (event.track.kind == "audio") {
        remote_aud_stream[conn_id].getAudioTracks().forEach((t) => {
          remote_aud_stream[conn_id].removeTrack(t);
        });
        remote_aud_stream[conn_id].addTrack(event.track);
        var remoteAudioPlayer = document.getElementById("a_" + conn_id);
        remoteAudioPlayer.srcObject = null;
        remoteAudioPlayer.srcObject = remote_aud_stream[conn_id];
      }
    };
    peers_conn_ids[conn_id] = conn_id;
    peers_connections[conn_id] = connection;
  }

  async function setOffer(connId) {
    var connection = peers_connections[connId];
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    serverProcess(
      JSON.stringify({ offer: connection.localDescription }),
      connId,
    );
  }

  async function SDP_Process(message, from_connId) {
    message = JSON.parse(message);
    if (message.answer) {
      await peers_connections[from_connId].setRemoteDescription(
        new RTCSessionDescription(message.answer),
      );
    } else if (message.offer) {
      if (!peers_connections[from_connId]) {
        await setConnection(from_connId);
      }
      await peers_connections[from_connId].setRemoteDescription(
        new RTCSessionDescription(message.offer),
      );
      var answer = await peers_connections[from_connId].createAnswer();
      await peers_connections[from_connId].setLocalDescription(answer);
      serverProcess(JSON.stringify({ answer: answer }), from_connId);
    }
  }
  return {
    setNewConnection: async function (conn_id) {
      await setConnection(conn_id);
    },
    // We get these params from MyApp, since it communcates with the Server.
    init: async function (SDP_function, myconn_id) {
      await _init(SDP_function, myconn_id);
    },
    processClientFunction: async function (message, from_connId) {
      await SDP_Process(message, from_connId);
    },
  };
})();

// TALK TO SERVER
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
      $("<video autoplay muted>", {
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

    var SDP_function = function (data, to_conn_id) {
      socket.emit("SDP_Process", {
        message: data,
        to_connId: to_conn_id,
      });
    };

    socket.on("connect", function () {
      console.log("Socket Connected to Client-Side " + socket.id);
      console.log("socket.connected:", socket.connected);
      console.log("Checking userID and roomID:", userID, roomID);

      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);
        if (userID !== "" && roomID !== "") {
          console.log("About to emit userconnect with:", {
            displayName: userID,
            roomID: roomID,
          });

          socket.emit("userconnect", {
            displayName: userID,
            roomID: roomID,
          });
          $("#pinned-pic").attr("src", "https://example.com/user-avatar.jpg");
          $("#pinned-name").text(userID);
          // $('#pinned-video').attr('src', 'https://example.com/user-video.mp4');
          // $('#pinned-audio').attr('src', 'https://example.com/user-audio.mp3');
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
      // To establish connection between users without server
      AppProcess.setNewConnection(data.conn_id);
    });

    socket.on("SDP_Process", async function (data) {
      await AppProcess.processClientFunction(data.message, data.from_connId);
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
