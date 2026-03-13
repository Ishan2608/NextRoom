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
var users = new Map();
var peerConnections = new Map();
var localStream = null;
var remoteMediaStream = null;

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

  // Define the logic to execute once connected
  const executeJoin = () => {
    users.set(socket.id, { userId, username, email, socketId: socket.id });
    socket.emit("join-room", { meetCode, userId, username, email });
    console.log(`SOCKET:EMIT:JOIN-ROOM | user=${username} (id=${userId}) joining room=${meetCode}`);
  };

  // Check if socket is already connected. If not, wait for the connect event.
  if (socket.connected) {
    executeJoin();
  } else {
    socket.on("connect", executeJoin);
  }
}

// TODO: Listen for "user-joined" event from the server.
// This fires when someone else enters the same room.
socket.on("user-joined", ({ userId, username, email, socketId })=>{
  console.log(`SOCKET:ON:USER-JOINED | New user=${username} (id=${userId}) with socketId=${socketId} joined`);
  users.set(socketId, {userId, username, email, socketId});
  const userData = {userId: userId, username: username, email: email, socketId: socketId};
  addParticipantToUI(userData);
  createOffer(userData);
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
  const localUserData = users.get(socket.id);
  users.clear();
  // 2. IMPORTANT: Clear the UI container to prevent duplicates on reload
  $("#vid-others").empty();

  if (localUserData) {
    users.set(socket.id, localUserData);
  }
  
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

function createPC(remoteUser){
  const pc = new RTCPeerConnection(iceConfig);

  // Map this connection to remote user's socket id.
  peerConnections.set(remoteUser.socketId, pc);

  // If the local user has enabled media (camera/mic), attach these tracks to the connection.
  // Intuitive Explanation: Think of this as plugging your local microphone cable into the dedicated pipeline for this specific user.
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.onicecandidate = (event) => {
    if (event.candidate){
      const senderUser = users.get(socket.id);
      socket.emit("ice-candidate", {
        candidate: event.candidate,
        targetSocketId: remoteUser.socketId,
        senderUser: senderUser
      });
    }
  }

  pc.ontrack = (event) => {
    console.log(`RTC:ON-TRACK: Recieved remote stream from ${remoteUser.username}`);
    displayRemoteStream(remoteUser, event.streams[0]);
  }
  
  // Triggered automatically when addTrack() or removeTrack() is called mid-call
  pc.onnegotiationneeded = async () => {
    try{
      console.log(`RTC:NEGOTIATION | Hardware changed, renegotiating with ${remoteUser.username}`);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const senderUser = users.get(socket.id);

      socket.emit("offer", {
        offer: pc.localDescription,
        targetSocketId: remoteUser.socketId,
        senderUser: senderUser
      });
    }
    catch (e){
      console.error("RTC:ERROR | Renegotiation failed", error);
    }
  }
  
  pc.onconnectionstatechange = () => {
    console.log(`RTC:STATE-CHANGE | Connection with ${remoteUser.username}: ${pc.connectionState}`);
  }
  return pc;
}

// ============================================================
// SECTION 5: OFFER AND ANSWER
// ============================================================

async function createOffer(remoteUser){
  const pc = createPC(remoteUser);

  const offer = await pc.createOffer(); // Create offer to send.
  await pc.setLocalDescription(offer); // store in LocalDescription.

  const senderUser = users.get(socket.id);
  socket.emit("offer", {
    offer: pc.localDescription,
    targetSocketId: remoteUser.socketId,
    senderUser: senderUser
  });

  console.log(`RTC:EMIT:OFFER | ${senderUser.username} Sen offer to ${remoteUser.username}`);
}

async function createAnswer(offer, remoteUser){
  const pc = createPC(remoteUser);

  // Store sender's offer.
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  // Generate Answer SDP.
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  const senderUser = users.get(socket.id);
  socket.emit("answer", {
    answer: pc.localDescription,
    targetSocketId: remoteUser.socketId,
    senderUser: senderUser
  });
  console.log(`RTC:EMIT:ANSWER | ${senderUser.username} Sent answer to ${remoteUser.username}`);
}


// Listen for an incoming offer

socket.on("offer", async ({offer, senderUser}) => {
  console.log(`SOCKET:ON:OFFER | Received offer from ${senderUser.username}`);
  // Add the offer sender if already not in users HashMap
  if (!users.has(senderUser.socketId)){
    users.set(senderUser.socketId, senderUser);
  }

  // Send him an Answer.
  await createAnswer(offer, senderUser);
});

socket.on("answer", async ({answer, senderUser}) => {
  console.log(`SOCKET:ON:ANSWER | Received answer from ${senderUser.username}`);
  const pc = peerConnections.get(senderUser.socketId);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } else {
    console.error(`RTC:ERROR | No peer connection found for ${senderUser.username}`);
  }
});

socket.on("ice-candidate", async ({candidate, senderUser}) => {
  const pc = peerConnections.get(senderUser.socketId);

  if (pc){
    try{
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`RTC:ON:ICE-CANDIDATE | Added candidate from ${senderUser.username}`);
    }
    catch (e){
      console.error(`RTC:ERROR | Failed to add ICE candidate from ${senderUser.username}`, e);
    }
  }
});

// ============================================================
// SECTION 6: DISPLAY REMOTE STREAM
// ============================================================

function displayRemoteStream(remoteUser, stream){
  const videoElement = document.getElementById(`p-video-${remoteUser.socketId}`);
  if (videoElement){
    videoElement.srcObject= stream;

    const overlayElement = document.getElementById(`p-overlay-${remoteUser.userId}`);
    if (overlayElement) {
      overlayElement.style.display = "none";
    }
    console.log(`RTC:UI | Rendered stream for ${remoteUser.username}`);
  } else {
    console.error(`RTC:ERROR | Video element not found for ${remoteUser.username}`);
  }
}


function addTrackToPeer(track, stream){
  peerConnections.forEach((pc) => {
    const senders = pc.getSenders();
    const trackExists = senders.some(sender => sender.track === track);
    if (!trackExists) pc.addTrack(track, stream);
  })
}

function removeTrackFromPeer(track){
  peerConnections.forEach((pc) => {
    const sender = pc.getSenders().find(s => s.track === track);
    if (sender) pc.removeTrack(sender);
  })
}

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

function sendChatMessage(meetCode, userId, message){
  if (!message.trim()) return;
  socket.emit("chat-message", {meetCode, userId, message, timestamp: Date.now()});
  console.log(`SOCKET:EMIT:CHAT-MESSAGE: ${userId} sends message: ${message}`);
}

socket.on("chat-message", (data)=>{
  console.log(`SOCKET:ON:CHAT-MESSAGE: Reading sent message ...`);
  displayChatMessage(data);
});


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
export {setLocalStream, setMeetCode, joinRoom, createPC, sendChatMessage, addTrackToPeer, removeTrackFromPeer};
// export {joinRoom, sendChatMessage, addTrackToPeer, removeTrackFromPeer, setLocalStream};
