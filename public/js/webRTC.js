// webRTC.js
// This file is responsible for:
//   - Creating and managing the socket connection
//   - Creating and managing the RTCPeerConnection
//   - Handling all signalling events (offer, answer, ICE)
//   - Handling chat messages over socket
//
// All functions and variables that app.js needs are exported at the bottom.


// ============================================================
// SECTION 1: SOCKET CONNECTION
// ============================================================

// TODO: Import the socket.io client library.
// Since you are using type="module", you cannot use the global `io` from CDN directly.
import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

// TODO: Create the socket connection.
const socket = io(); // it will connect to the same server that served the page.

// TODO: Listen for the "connect" event on the socket.
socket.on("connect", () => {
  console.log(`SOCKET-EVENT:ON:CONNECT: Connected to socket = ${socket.id}`);
});

// TODO: Listen for the "disconnect" event on the socket.
socket.on("disconnect", () => {
  console.log(`SOCKET-EVENT:ON:DISCONNECT: Connection to socket = ${socket.id} TERMINATED`);
});

// ============================================================
// SECTION 2: GLOBAL STATE
// ============================================================

var currentMeetCode = null;
var pc;
var localStream = null;
var remoteMediaStream = null;
var users = new Map();

const iceConfig = {
  iceServers: [ {urls: 'stun:stun.l.google.com:19302'} ]
}

function setLocalStream(stream){
  localStream = stream;
}

function setMeetCode(code){
  currentMeetCode = code;
}

function getUserInitials(name) {
  const parts = name.trim().split(" ");
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

function addParticipantToUI(user){
  // Ensure we don't add the same user twice (safety check)
  if ($(`#p-container-${user.socketId}`).length > 0) return;
  
  const ins = getUserInitials(user.username);
  const participant = `
    <div class="participant" id="p-container-${user.socketId}">
        <video autoplay muted playsinline id="p-video-${user.socketId}"></video>
        <div id="p-overlay-${user.userId}" class="participant-overlay">
            <div id="p-profile-${user.socketId}" class="participant-profile">${ins}</div>
            <div id="p-name-${user.socketId}" class="participant-name">${user.username}</div>
        </div>
    </div>
  `;
  $("#vid-others").append(participant);
}

function removeParticipantFromUI(socketId) {
  $(`#p-container-${socketId}`).remove();
}

// ============================================================
// SECTION 3: JOIN ROOM
// ============================================================

// TODO: Write and export a function: joinRoom(meetCode, userId)
// This is called from app.js when the room page loads.
function joinRoom(meetCode, userId, username, email){
  users.set(socket.id, {userId: userId, username: username, email: email, socketId: socket.id});

  $("#vid-pinned-overlay-profile").text(getUserInitials(username));
  $("#vid-pinned-overlay-name").text(username);
  
  socket.emit("join-room", {meetCode, userId, username, email});
  console.log(`SOCKET:EMIT:JOIN-ROOM | user=${username} (id=${userId}) joining room=${meetCode}`);
}

// TODO: Listen for "user-joined" event from the server.
// This fires when someone else enters the same room.
socket.on("user-joined", ({ userId, username, email, socketId })=>{
  console.log(`SOCKET:ON:USER-JOINED | New user=${username} (id=${userId}) with socketId=${socketId} joined`);
  users.set(socketId, {userId, username, email, socketId});
  const userData = {userId: userId, username: username, email: email, socketId: socketId};
  addParticipantToUI(userData);
  // createOffer();
});

// TODO: Listen for "user-left" event from the server.
socket.on("user-left", ({ userId, username, email, socketId})=>{
  console.log(`SOCKET:ON:USER-LEFT | user=${username} (id=${userId}) socketId=${socketId}`);
  users.delete(socketId);
  removeParticipantFromUI(socketId);
  // handleUserLeft();
});

// TODO: Get list of participants already joined in the room:
socket.on("get-others", (others) => {
  // others = [{userId: , username: , email: , socketId: }, ...]
  // Empty out the old list (before page reload if any, to get a fresh list.)
  users.clear();
  // 2. IMPORTANT: Clear the UI container to prevent duplicates on reload
  $("#vid-others").empty();
  console.log(`SOCKET:ON:GET-OTHERS: List of other participants is...`);
  console.log(others);
  for (const other of others){
    users.set(other.socketId, other);
    addParticipantToUI(other);
  }
});

// ============================================================
// SECTION 4: CREATE PEER CONNECTION
// ============================================================

// TODO: Write a function: createPeerConnection(localStream)
// This is called before creating an offer or answer.
function createPeerConnection(localStream){
  pc = new RTCPeerConnection(iceConfig);

  // This is what sends YOUR video/audio to the remote user.
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (event)=>{
    if(event.candidate) {
      socket.emit("ice-candidate", { candidate: event.candidate, meetCode: currentMeetCode });
      console.log(`SOCKET-EVENT:EMIT:ICE-CANDIDATE: For meet = ${currentMeetCode}`);
    }
  };
  // When fired, event.streams[0] is the remote user's live MediaStream.
  pc.ontrack = (event)=>{
    remoteMediaStream = event.streams[0]
    console.log(`RTC-EVENT:ON-TRACK: Remote Stream recieved`);
    // displayRemoteStream(remoteMediaStream);
  };

  pc.onconnectionstatechange = ()=>{
    console.log(`RTC-EVENT:ON-CONNECTION-STATE-CHANGE: Connection state is changing...`);
    console.log(`Connection State => ${pc.connectionState}`);
  }
}

// ============================================================
// SECTION 5: OFFER AND ANSWER
// ============================================================

// Called by the user already in the room when a new user joins.
// TODO: Write a function: createOffer(localStream)
// Called by the user who was already in the room when a new user joins.
// Inside:
//   Call createPeerConnection(localStream).
//   Call peerConnection.createOffer() — this is async, use await.
//   Call peerConnection.setLocalDescription(offer) — store it on our side.
//   Emit "offer" to the server.
//   Pass: { offer: peerConnection.localDescription, meetCode: MEETCODE }
//   console.log("Offer created and sent")

// TODO: Write a function: createAnswer(offer, localStream)
// Called by the user who just joined, after receiving an offer.
// Inside:
//   Call createPeerConnection(localStream).
//   Call peerConnection.setRemoteDescription(offer) — store what the other side sent.
//   Call peerConnection.createAnswer() — async, use await.
//   Call peerConnection.setLocalDescription(answer).
//   Emit "answer" to the server.
//   Pass: { answer: peerConnection.localDescription, meetCode: MEETCODE }
//   console.log("Answer created and sent")

// TODO: Listen for "offer" event from server.
// Inside:
//   console.log("Offer received")
//   Call createAnswer(event.offer, localStream)
//   Note: localStream must be passed in or accessed here.
//   You will need to think about how to get localStream into this file.
//   One clean approach: export a function setLocalStream(stream) that stores
//   it in a module-level variable inside rtc.js.

// TODO: Listen for "answer" event from server.
// Inside:
//   console.log("Answer received")
//   Call peerConnection.setRemoteDescription(answer)
//   Wrap in try/catch.

// TODO: Listen for "ice-candidate" event from server.
// Inside:
//   Create a new RTCIceCandidate from the received data.
//   Call peerConnection.addIceCandidate(candidate)
//   Wrap in try/catch — a bad candidate should not crash the call.
//   console.log("ICE candidate added")


// ============================================================
// SECTION 6: DISPLAY REMOTE STREAM
// ============================================================

// TODO: Write a function: displayRemoteStream(stream)
// Inside:
//   Find the first participant <video> element inside #vid-others
//   that does not yet have a srcObject assigned.
//   Hint: loop over $(".participant video") and check if srcObject is null.
//   Set srcObject = stream on the found element.
//   Call .play() on it.
//   Hide the overlay for that participant tile.
//   console.log("Remote stream displayed")


// ============================================================
// SECTION 7: HANDLE USER LEFT
// ============================================================

// TODO: Write a function: handleUserLeft()
// Inside:
//   If peerConnection exists:
//     Call peerConnection.close()
//     Set peerConnection = null
//   If remoteStream exists:
//     Stop all its tracks: remoteStream.getTracks().forEach(t => t.stop())
//     Set remoteStream = null
//   Find the participant video element that has a srcObject.
//     Set its srcObject = null.
//     Show its overlay again.
//   console.log("Peer connection closed, remote stream cleared")


// ============================================================
// SECTION 8: CHAT MESSAGES
// ============================================================

// TODO: Write and export a function: sendChatMessage(meetCode, userId, message)
// Inside:
//   Emit "chat-message" to the server.
//   Pass: { meetCode, userId, message, timestamp: Date.now() }

// TODO: Listen for "chat-message" event from the server.
// Inside:
//   Call displayChatMessage(data) — defined in app.js or here.
//   This will append the message to #chat-interface-body.


// ============================================================
// SECTION 9: TRACK SYNC (enable/disable mid-call)
// ============================================================

// TODO: Write and export a function: addTrackToPeer(track, localStream)
// Called from enableVideo() and enableAudio() in app.js after a track is created.
// Inside:
//   If peerConnection is null, return — no active call yet, nothing to sync.
//   Call peerConnection.addTrack(track, localStream)

// TODO: Write and export a function: removeTrackFromPeer(track)
// Called from disableVideo() and disableAudio() in app.js before a track is stopped.
// Inside:
//   If peerConnection is null, return.
//   Find the matching sender: peerConnection.getSenders()
//     A sender is the outgoing track wrapper inside the peer connection.
//     Find the one where sender.track === track.
//   If found, call peerConnection.removeTrack(sender).


// ============================================================
// EXPORTS
// ============================================================

// TODO: Export everything that app.js needs to call directly:
export {setLocalStream, setMeetCode, joinRoom, createPeerConnection};
// export {joinRoom, sendChatMessage, addTrackToPeer, removeTrackFromPeer, setLocalStream};
