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

import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

socket.on("connect", () => {
  console.log(`SOCKET-EVENT:ON:CONNECT: Connected to socket = ${socket.id}`);

  // Inform app.js of our real socket ID so the pinned container's
  // data-active-socket is updated from the "__local__" sentinel to the
  // true socket ID. This must happen AFTER the socket connects because
  // socket.id is only available at that point.
  if (typeof window.setPinnedSocketToLocal === "function") {
    window.setPinnedSocketToLocal(socket.id);
  }
});

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

/*
  addParticipantToUI(user)

  Creates the side-grid card for a remote participant.

  data-active-socket is set here at card creation. This is the attribute
  getContainerForSocket() in app.js reads to find which physical DOM element
  currently holds a given socket's video. Every card starts with its own
  socketId. After a pin-swap, app.js swaps this attribute between the two
  containers so all downstream lookups follow the video to its new home.

  data-rendered-socket is a permanent, never-swapped copy of the socketId.
  It is used only by removeParticipantFromUI so a card can always be found
  for deletion even after its active-socket has been swapped away.
*/
function addParticipantToUI(user){
  if ($(`#p-container-${user.socketId}`).length > 0) return;

  const ins = getUserInitials(user.username);
  const participant = `
    <div class="participant"
         id="p-container-${user.socketId}"
         data-rendered-socket="${user.socketId}"
         data-active-socket="${user.socketId}">
        <video autoplay playsinline id="p-video-${user.socketId}"></video>
        <div class="participant-overlay">
            <div class="participant-profile">${ins}</div>
            <div class="participant-name">${user.username}</div>
        </div>
    </div>
  `;
  $("#vid-others").append(participant);
}

function removeParticipantFromUI(socketId) {
  $(`[data-rendered-socket="${socketId}"]`).remove();
}

// ============================================================
// SECTION 3: JOIN ROOM
// ============================================================

function joinRoom(meetCode, id, username, email){
  users.set(socket.id, {id: id, username: username, email: email, socketId: socket.id});

  $("#vid-pinned-overlay-profile").text(getUserInitials(username));
  $("#vid-pinned-overlay-name").text(username);

  const executeJoin = () => {
    users.set(socket.id, { id, username, email, socketId: socket.id });
    socket.emit("join-room", { meetCode, id, username, email });
    console.log(`SOCKET:EMIT:JOIN-ROOM | user=${username} (id=${id}) joining room=${meetCode}`);
  };

  if (socket.connected) {
    executeJoin();
  } else {
    socket.on("connect", executeJoin);
  }
}

socket.on("user-joined", ({ id, username, email, socketId }) => {
  console.log(`SOCKET:ON:USER-JOINED | New user=${username} (id=${id}) with socketId=${socketId} joined`);
  users.set(socketId, {id, username, email, socketId});
  const userData = {id, username, email, socketId};
  addParticipantToUI(userData);
  createOffer(userData);
});

socket.on("user-left", ({ id, username, email, socketId }) => {
  console.log(`SOCKET:ON:USER-LEFT | user=${username} (id=${id}) socketId=${socketId}`);
  users.delete(socketId);

  // If this user was pinned to the main slot, clear that slot before removal
  // so it does not freeze on their last frame.
  if (typeof window.getContainerForSocket === "function") {
    const container = window.getContainerForSocket(socketId);
    if (container && container.id === "vid-pinned") {
      const pinnedVideo   = container.querySelector("video");
      const pinnedOverlay = document.getElementById("vid-pinned-overlay");
      if (pinnedVideo)   pinnedVideo.srcObject = null;
      if (pinnedOverlay) pinnedOverlay.style.display = "flex";
      console.log(`PIN:CLEANUP | Departed user ${username} was pinned; pinned slot cleared`);
    }
  }

  removeParticipantFromUI(socketId);

  const pc = peerConnections.get(socketId);
  if (pc){
    pc.close();
    peerConnections.delete(socketId);
    console.log(`RTC:CLEANUP | Closed connection for ${username}`);
  }
});

socket.on("get-others", (others) => {
  const localUserData = users.get(socket.id);
  users.clear();
  $("#vid-others").empty();

  if (localUserData) {
    users.set(socket.id, localUserData);
  }

  console.log(`SOCKET:ON:GET-OTHERS: List of other participants...`);
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

  peerConnections.set(remoteUser.socketId, pc);

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
  };

  pc.ontrack = (event) => {
    console.log(`RTC:ON-TRACK: Received track from ${remoteUser.username}, kind=${event.track.kind}`);

    const stream = event.streams[0];

    // Wire the video element to this stream immediately.
    // syncOverlay (below) decides whether to show or hide the overlay.
    const videoEl = window.getVideoForSocket
      ? window.getVideoForSocket(remoteUser.socketId)
      : document.getElementById(`p-video-${remoteUser.socketId}`);

    if (videoEl && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
    }

    /*
      syncOverlay — the single source of visual truth for this remote user.

      SIMPLE EXPLANATION:
      Every time anything changes (track added, track removed, track ended,
      camera toggled), we run this one function. It looks at what is ACTUALLY
      happening on the stream right now and either shows the video or shows
      the profile overlay. No guessing, no trusting individual events.

      The key detail: when we decide to show the overlay (no live video),
      we set videoEl.srcObject = null. Without this, the <video> element
      keeps the last decoded frame in its render buffer and the overlay
      renders on top of a frozen image instead of a clean background.

      TECHNICAL EXPLANATION — why earlier attempts failed:

      Problem A — frozen frame:
        syncOverlay was showing the overlay but never nulling srcObject.
        The browser does not clear the video buffer when a stream loses
        its tracks. You must explicitly set srcObject = null.

      Problem B — property assignment vs addEventListener:
        stream.onremovetrack = fn  can only hold one handler. Chrome fires
        pc.ontrack once per track (audio first, then video). The second
        call overwrites the first handler. The first stream's remove-track
        events then fire into nothing.
        FIX: use stream.addEventListener("removetrack", ...) — supports
        multiple listeners, never overwrites.

      Problem C — tracks not yet present at ontrack time:
        stream.getTracks() may return only the audio track when ontrack
        fires for the audio track. The video track has not arrived yet.
        Looping over getTracks() here misses the video track entirely.
        FIX: also listen to stream's "addtrack" event to watch tracks
        that arrive after this ontrack call.

      Problem D — track.onended race with renegotiation:
        When the sender stops screen share, removeTrack() triggers
        onnegotiationneeded → new offer → createAnswer → createPC →
        a brand-new RTCPeerConnection. The new PC's ontrack fires and
        re-installs syncOverlay on the new stream. But there is a gap
        between the old track ending and the new ontrack completing.
        addEventListener on the stream handles this by accumulating
        listeners rather than replacing them.
    */
    function syncOverlay() {
      const hasLiveVideo = stream.getVideoTracks().some(
        t => t.readyState === "live" && t.enabled
      );

      // Re-fetch the element every call because a pin-swap may have moved
      // the active container between the pinned slot and a side card.
      const el = window.getVideoForSocket
        ? window.getVideoForSocket(remoteUser.socketId)
        : document.getElementById(`p-video-${remoteUser.socketId}`);

      if (!el) return;

      if (hasLiveVideo) {
        if (el.srcObject !== stream) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
        hideOverlayForSocket(remoteUser.socketId);
        console.log(`RTC:OVERLAY:HIDE | ${remoteUser.username} — live video`);
      } else {
        // CRITICAL: null the srcObject to release the frozen frame.
        // The overlay cannot render cleanly over a frozen video buffer.
        el.srcObject = null;
        showOverlayForSocket(remoteUser.socketId);
        console.log(`RTC:OVERLAY:SHOW | ${remoteUser.username} — no live video`);
      }
    }

    // watchTrack: attach syncOverlay to a single track's lifecycle events.
    // Called for tracks present now AND tracks that arrive later.
    function watchTrack(track) {
      if (track.kind !== "video") return;
      // addEventListener accumulates — safe to call multiple times on the
      // same track without creating duplicate listeners (the browser
      // deduplicates identical listener references automatically).
      track.addEventListener("ended",  syncOverlay);
      track.addEventListener("mute",   syncOverlay);
      track.addEventListener("unmute", syncOverlay);
      console.log(`RTC:WATCH | Watching video track from ${remoteUser.username}`);
    }

    // Watch any video tracks already on the stream.
    stream.getTracks().forEach(watchTrack);

    // Watch tracks added later (e.g. screen share starts mid-call).
    // addEventListener is used here specifically to avoid overwriting the
    // listener installed by a previous ontrack call for a different track.
    stream.addEventListener("addtrack", (e) => {
      watchTrack(e.track);
      syncOverlay();
    });
    stream.addEventListener("removetrack", syncOverlay);

    // Sync immediately to establish correct initial visual state.
    syncOverlay();
  };

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
      console.error("RTC:ERROR | Renegotiation failed", e);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`RTC:STATE-CHANGE | Connection with ${remoteUser.username}: ${pc.connectionState}`);
  };

  return pc;
}

// ============================================================
// SECTION 5: OFFER AND ANSWER
// ============================================================

async function createOffer(remoteUser){
  const pc = createPC(remoteUser);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const senderUser = users.get(socket.id);
  socket.emit("offer", {
    offer: pc.localDescription,
    targetSocketId: remoteUser.socketId,
    senderUser: senderUser
  });

  console.log(`RTC:EMIT:OFFER | ${senderUser.username} sent offer to ${remoteUser.username}`);
}

async function createAnswer(offer, remoteUser){
  const pc = createPC(remoteUser);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  const senderUser = users.get(socket.id);
  socket.emit("answer", {
    answer: pc.localDescription,
    targetSocketId: remoteUser.socketId,
    senderUser: senderUser
  });
  console.log(`RTC:EMIT:ANSWER | ${senderUser.username} sent answer to ${remoteUser.username}`);
}

socket.on("offer", async ({offer, senderUser}) => {
  console.log(`SOCKET:ON:OFFER | Received offer from ${senderUser.username}`);
  if (!users.has(senderUser.socketId)){
    users.set(senderUser.socketId, senderUser);
  }
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
// SECTION 6: OVERLAY HELPERS
// ============================================================

/*
  showOverlayForSocket / hideOverlayForSocket

  These are called only by syncOverlay() inside pc.ontrack.
  They use window.getOverlayForSocket (defined in app.js) to find the
  overlay element in whichever container — pinned slot or side card —
  currently holds this socket's video. This means they work correctly
  regardless of how many pin-swaps have occurred.
*/
function showOverlayForSocket(socketId) {
  if (!window.getOverlayForSocket) return;
  const overlay = window.getOverlayForSocket(socketId);
  if (overlay) overlay.style.display = "flex";
}

function hideOverlayForSocket(socketId) {
  if (!window.getOverlayForSocket) return;
  const overlay = window.getOverlayForSocket(socketId);
  if (overlay) overlay.style.display = "none";
}

function addTrackToPeer(track, stream){
  peerConnections.forEach((pc) => {
    const senders = pc.getSenders();
    const trackExists = senders.some(sender => sender.track === track);
    if (!trackExists) pc.addTrack(track, stream);
  });
}

function removeTrackFromPeer(track){
  peerConnections.forEach((pc) => {
    const sender = pc.getSenders().find(s => s.track === track);
    if (sender) pc.removeTrack(sender);
  });
}

// ============================================================
// SECTION 7: HANDLE USER LEFT
// ============================================================

function handleUserLeft(){
  console.log("RTC:CLEANUP: Cleaning up WebRTC and Socket State...");
  peerConnections.forEach((pc, socketId) => {
    pc.close();
    const user = users.get(socketId);
    console.log(`RTC:CLEANUP | Closed connection with ${socketId} = ${user?.username}`);
  });
  peerConnections.clear();

  if (localStream){
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    console.log("RTC:CLEANUP | Local media tracks stopped");
  }
  users.clear();
  currentMeetCode = null;

  if (socket.connected) {
    socket.disconnect();
  }
}

// ============================================================
// SECTION 8: CHAT MESSAGES
// ============================================================

function sendChatMessage(meetCode, id, message){
  if (!message.trim()) return;
  socket.emit("chat-message", {meetCode, id, message, timestamp: Date.now()});
  console.log(`SOCKET:EMIT:CHAT-MESSAGE: ${id} sends message: ${message}`);
}

socket.on("chat-message", (data) => {
  console.log(`SOCKET:ON:CHAT-MESSAGE: Reading sent message...`);
  if (typeof window.displayChatMessage === "function") {
    window.displayChatMessage(data);
  }
});

// ============================================================
// EXPORTS
// ============================================================

function getUsers() {
  return users;
}

export {
  setLocalStream, setMeetCode,
  joinRoom, createPC, sendChatMessage, addTrackToPeer, removeTrackFromPeer, handleUserLeft,
  getUsers
};
