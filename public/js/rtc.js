/*
    - Since main.js imports it and that file is imported into html as module, 
    this code runs automatically when any page is loaded.
    - Handles Communication with Signaling Server and Established Peer 2 Peer Connection.
*/

import { 
    addParticipantToUI, removeParticipantFromUI,
    displayChatMessage
} from './utils.js';

import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

/**
 * Global Variables to Manage User to User Mapping and Their Respective PCs.
 * User Map -> Contains Details of All Users in the Current Room.
 * pcMap -> Contains PC Object formed with each remote user.
*/

var userMap = new Map();
var pcMap = new Map();
/*
This Map holds a list of candidates for each remote peer.
Key:   the remote user's socketId (a string like "XkP2q...")
Value: an array of ICE candidate objects that arrived too early

Example of what it looks like mid-race:
  pendingCandidates = {
    "XkP2q..." => [candidate1, candidate2, candidate3],
    "Rm9zL..." => [candidate1]
  }
*/
var pendingCandidates = new Map();

const iceConfig = {
  iceServers: [ {urls: 'stun:stun.l.google.com:19302'} ]
};

// Camera and microphone
var camStream = null;
var videoTrack = null;
var audioTrack = null;

// Screen capture
var screenStream = null
var screenTrack = null;

/*
Toggling Tracks On and Off:
Two operations are both commonly called "toggling", but they behave differently in WebRTC.

1. track.enabled = false / true:
Pauses the track without removing it from the connection. 
No renegotiation. The slot in the SDP stays reserved. 
Re-enabling is instant. Use this for muting mic or temporarily disabling camera.

2. pc.removeTrack(sender)
Fully removes the track from the connection. 
onnegotiationneeded fires and a new offer-answer cycle runs. 
Use this when stopping screen share and switching back to camera.
*/

/**
 * Emit a signal to all peers in the room to update their UI
 * when a track is turned on or off.
 * @param {"on"|"off"} type
 * @param {"audio"|"video"|"screen"} track
 */
function emitSignal(type, track) {
    socket.emit("signal", {
        type: type,
        track: track,
        fromUser: { ...window.__USER, socketId: socket.id },
        toMeetCode: window.__MEETCODE
    });
}

/**
  * If Audio is there, play it, otherwise, disable it.
  * Update the UI of Control Button. 
  * Uses track.enabled because muting audio does not need renegotiation —
  * the slot in the SDP stays reserved, the track just sends silence.
*/
async function toggleAudio() {
    if (!audioTrack) {
        // No mic stream yet — request it for the first time.
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            audioTrack = micStream.getAudioTracks()[0];
            // If camStream already exists (camera was turned on first), merge this audio
            // track into it so both tracks share the same stream object in peer connections.
            if (!camStream) camStream = micStream;
            // Add the new track to every existing peer connection.
            pcMap.forEach((pc) => pc.addTrack(audioTrack, camStream));
        } catch (err) {
            console.error("toggleAudio: Could not get microphone:", err);
            return;
        }
        // First acquisition = turn ON. Do not fall through to the toggle logic.
        $("#mic-btn").addClass("active");
        emitSignal("on", "audio");
        return;
    }

    const isActive = audioTrack.enabled;  // true = currently ON, we want to turn it OFF.

    if (isActive) {
        // Turn OFF — mute but keep track alive in the connection.
        audioTrack.enabled = false;
        $("#mic-btn").removeClass("active");
        emitSignal("off", "audio");
    } else {
        // Turn ON — unmute.
        audioTrack.enabled = true;
        $("#mic-btn").addClass("active");
        emitSignal("on", "audio");
    }
}

/**
  * If Video is there, play it, otherwise, disable it.
  * If screenTrack is currently sharing, stop it first and replace with camera.
  * Fully stops and nulls the track on turn-off so re-share re-acquires a live track.
*/
async function toggleVideo() {
    if (!videoTrack) {
        // No camera track yet — request it for the first time, or re-acquire after stop.
        try {
            const vidStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            videoTrack = vidStream.getVideoTracks()[0];
            if (!camStream) {
                // No stream yet — use the video stream as camStream.
                camStream = vidStream;
            } else {
                // Audio was turned on first — camStream already exists as an audio-only
                // stream. Add the video track into it so both tracks are grouped together
                // in the same stream. Peers receive event.streams[0] in ontrack, and that
                // stream must contain all tracks for srcObject assignment to show video.
                camStream.addTrack(videoTrack);
            }

            // If screen was being shared, stop it and replace with camera on all peers.
            if (screenTrack) {
                screenTrack.stop();
                pcMap.forEach((pc) => {
                    const sender = pc.getSenders().find(s => s.track === screenTrack);
                    if (sender) sender.replaceTrack(videoTrack);
                });
                screenTrack = null;
                screenStream = null;
                $("#screen-btn").removeClass("active");
                emitSignal("off", "screen");
            } else {
                // No screen share was active.
                // Use replaceTrack if a video sender slot already exists (avoids duplicate senders).
                // Only call addTrack (which triggers renegotiation) if no slot exists at all.
                pcMap.forEach((pc) => {
                    const existingSender = pc.getSenders().find(s => s.track?.kind === "video");
                    if (existingSender) {
                        existingSender.replaceTrack(videoTrack);
                    } else {
                        pc.addTrack(videoTrack, camStream);
                    }
                });
            }

            // Mirror local camera feed into the pinned (self) video element.
            const localVid = document.getElementById("vid-pinned-video");
            if (localVid) localVid.srcObject = camStream;

        } catch (err) {
            console.error("toggleVideo: Could not get camera:", err);
            return;
        }
        // First acquisition = turn ON. Do not fall through to the toggle logic.
        $("#video-btn").addClass("active");
        $("#vid-pinned-overlay").fadeOut();
        emitSignal("on", "video");
        return;
    }

    // videoTrack already exists — it is currently ON (enabled). Turn it off.
    // We stop the track fully (camera light goes dark) and null it out so the
    // next click goes through the acquisition path above and re-adds the track.
    // Simply setting .enabled = false is NOT enough: the sender still holds the
    // old stopped track and addTrack never gets called on re-share, leaving the
    // peer with no new stream to display (the gray box bug).
    videoTrack.stop();
    pcMap.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track === videoTrack);
        // null-replace keeps the sender slot alive so re-enabling later can use
        // replaceTrack instead of addTrack, avoiding duplicate senders.
        if (sender) sender.replaceTrack(null);
    });
    videoTrack = null;

    // Clear local self-preview.
    const localVid = document.getElementById("vid-pinned-video");
    if (localVid) { localVid.pause(); localVid.srcObject = null; }

    $("#video-btn").removeClass("active");
    $("#vid-pinned-overlay").fadeIn();
    emitSignal("off", "video");
}

/**
  * Start or stop screen sharing.
  * Uses pc.removeTrack + addTrack (full renegotiation) because screen share
  * is a completely different MediaStreamTrack — you cannot just flip .enabled.
  * If camera video was active, it is replaced while screen share runs,
  * then restored when screen share ends.
*/
async function toggleScreen() {
    const isActive = screenTrack !== null;

    if (isActive) {
        // --- STOP SCREEN SHARE ---
        screenTrack.stop();

        // Remove the screen track sender from every peer connection.
        pcMap.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track === screenTrack);
            if (sender) {
                if (videoTrack) {
                    // Camera is active — swap back to it seamlessly, no renegotiation.
                    sender.replaceTrack(videoTrack);
                } else {
                    // No camera — null out the track to go silent but keep the sender
                    // slot alive. removeTrack would trigger full renegotiation and kill
                    // the slot, making re-share require addTrack again unnecessarily.
                    sender.replaceTrack(null);
                }
            }
        });

        screenTrack = null;
        screenStream = null;

        // Restore local self-preview to camera if it was on, otherwise blank it.
        const localVid = document.getElementById("vid-pinned-video");
        if (videoTrack && videoTrack.enabled) {
            if (localVid) localVid.srcObject = camStream;
            $("#vid-pinned-overlay").fadeOut();
        } else {
            if (localVid) { localVid.pause(); localVid.srcObject = null; }
            $("#vid-pinned-overlay").fadeIn();
        }

        $("#screen-btn").removeClass("active");
        emitSignal("off", "screen");

    } else {
        // --- START SCREEN SHARE ---
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            screenTrack = screenStream.getVideoTracks()[0];

            // When user stops share via the browser's own "Stop sharing" button,
            // call toggleScreen again to clean up state consistently.
            screenTrack.onended = () => toggleScreen();

            pcMap.forEach((pc) => {
                // Prefer replaceTrack on an existing video sender slot (no renegotiation,
                // no duplicate senders). Only addTrack if no video sender exists at all.
                const existingSender = pc.getSenders().find(s => s.track?.kind === "video");
                if (existingSender) {
                    existingSender.replaceTrack(screenTrack);
                } else {
                    pc.addTrack(screenTrack, screenStream);
                }
            });

            // Show screen feed in the local self-preview element.
            const localVid = document.getElementById("vid-pinned-video");
            if (localVid) localVid.srcObject = screenStream;
            $("#vid-pinned-overlay").fadeOut();

            $("#screen-btn").addClass("active");
            emitSignal("on", "screen");

        } catch (err) {
            // User cancelled the picker or permission was denied — not a real error.
            console.warn("toggleScreen: Screen share not started:", err);
        }
    }
}


/**
  * Called when this user visits the `/room?meetID=` route.
  * Signals server through emit:join-room  to let server know it needs to be added to a room.
  * Server emits user-joined to other users in the room, if any, informing them about this user.
  * They read on:user-joined and create a new PC object in pcMap for this user.
  * The server also emits get-others to this user, returning list of other users if any.
  * Then this user adds each one to his userMap, and creates a PC object for each one.
  * Then this user sends offer to each one of them.
*/
function joinRoom(){
    console.log(`SOCKET:EMIT:JOIN-ROOM`);
    const {id, username, email} = window.__USER;
    /*
        - If this user is not the only one in the room, he gets a list of other users 
        which he reads through socket:get-others. If first one, an empty list is returned.
        - This user then makes offer to each one in the list.
        - Server listens to socket:join-room and emits user-joined to others already present. 
    */
    socket.emit("join-room", {meetCode: window.__MEETCODE, id: id, username: username, email: email});
}

/**
  * Create a PC Object using default configs.
  * Adds the PC object to PC Map, mapping to a remote user.
  * Defines each event listener of PC Object.
  *
  * @param remoteUser  - the remote peer's user object
  * @param isCallee    - true when WE are receiving the offer (user-joined path).
  *                      false when WE are sending the offer (get-others path).
  *
  * When isCallee = true, we must NOT call sendOfferTo from onnegotiationneeded.
  * Adding our local tracks to the PC still queues them correctly — they will be
  * included in the answer SDP that we send back when the remote's offer arrives.
  * Sending a competing offer (collision) causes both sides' signalingState guards
  * to silently drop one negotiation, leaving tracks missing on one side.
*/
function createPC(remoteUser, isCallee = false){
    // Create a new WebRTC object, for remote user.
    const pc = new RTCPeerConnection(iceConfig);

    // Create mapping to other user and its PC Object.
    pcMap.set(remoteUser.socketId, pc);

    // Fired automatically when other peer calls `addTrack()`
    pc.ontrack = (event) => {
        // ID must match what addParticipantToUI() renders: "p-video-${socketId}"
        const vid = document.getElementById(`p-video-${remoteUser.socketId}`);
        if (vid && event.streams[0]) vid.srcObject = event.streams[0];
    };

    pc.onnegotiationneeded = async () => {
        // Callees never initiate — the new joiner (caller) always sends the first offer.
        // If we fire an offer here as a callee, it collides with the caller's offer and
        // one side silently drops its negotiation, leaving tracks undelivered.
        if (isCallee) return;

        if (pc.signalingState !== "stable") {
            console.log("Negotiation skipped — already negotiating. State:", pc.signalingState);
            return;
        }
        await sendOfferTo(remoteUser, pc);
    };
    
    // Fired Automatically after setLocalDescription();
    pc.onicecandidate = (event) => {
        if (event.candidate){
            socket.emit("ice-candidate", { 
                candidate: event.candidate, 
                targetSocketId: remoteUser.socketId,
                senderUser: {...window.__USER, socketId: socket.id}
            });
        }
    };

    // Fired each time connection state changes.
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    // Add this user's currently active local tracks to the new connection.
    // For callee path: these tracks are included in our answer SDP automatically.
    // For caller path: addTrack fires onnegotiationneeded which sends the offer.
    if (audioTrack) pc.addTrack(audioTrack, camStream);
    if (videoTrack) pc.addTrack(videoTrack, camStream);
    if (screenTrack) pc.addTrack(screenTrack, screenStream);

    return pc;
}

/**
  * Called when we read other users list in on:get-others, to send each one an offer.
  * Also called when pc.onnegotiationneeded is triggered.
  * Reads already created PC object for remote user. Creates offer. Saves in localDescription.
  * Emits the offer to signaling server.
  * The server reads it and just emits offer to other users.
  * They in their frontend, listen to on:offer and then create answer.
*/
async function sendOfferTo(remoteUser, pc) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // ICE candidate generation starts automatically in the background now.
    socket.emit("offer", { 
        offer: offer, 
        targetSocketId: remoteUser.socketId, 
        senderUser: {...window.__USER, socketId: socket.id}
    });
}

/**
  * Read and store incoming ICE Candidates from User x, only after remoteDescription is set.
  * Prevents race condition when ICE Candidates arrive before handshake is complete.
  * Maintains a Queue of candidates for each user.
*/
async function flushPendingCandidates(socketId) {
    // Get the connection we are flushing into.
    const pc = pcMap.get(socketId);

    // Get all candidates that were stored in the waiting room.
    // The "?? []" means: if there is no entry for this socketId at all
    // (no race happened, nobody was queued), use an empty array instead.
    // That way the function is always safe to call, even if the queue is empty.
    const queue = pendingCandidates.get(socketId) ?? [];

    // IMPORTANT: delete the waiting room BEFORE processing candidates.
    // Why? Because addIceCandidate() is async. If a new candidate arrives
    // while we are in the middle of flushing, the handler above would see
    // that remoteDescription is now set and take the safe path — no double-queue.
    pendingCandidates.delete(socketId);

    // Now loop through every candidate that was waiting and apply them.
    for (const candidate of queue) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            // A candidate failing here is usually harmless — the browser
            // will find other paths. Log it but do not stop the loop.
            console.warn("ICE flush error on one candidate:", e);
        }
    }
    // After this function returns, the waiting room is gone and all
    // candidates have been applied. The race window is closed.
}

/**
  * Automatically runs when frontend connects with backend for the first time. 
  * The socket ID used here is also the one server uses. This is unique to identify each frontend.
*/
socket.on("connect", ()=>{
    console.log(`SOCKET:ON:CONNECT: Connected with Socket ID = ${socket.id}`);
});

/**
  * Runs automatically when frontend loses connection with backend, or user just closes the app.
*/
socket.on("disconnect", ()=>{
    console.log(`SOCKET:ON:CONNECT: Disconnected from Socket ID = ${socket.id}`);
});

/** 
  * When you join a room, you get list of participants already in it. Save each user and send offer to each one.
  * @param others (Array) = [{id: , username: , email: , socketId: }, ...]
*/
socket.on("get-others", (others)=>{
    const len = others.length;
    console.log(`SOCKET:ON:GET-OTHERS: ${len} users alread in room = ${window.__MEETCODE}`);
    // Iterate over list of remote users.
    for (const otherUser of others){
        // Extract each one's details
        const {id, username, email, socketId} = otherUser;
        // Add them to UserMap and Update UI.
        userMap.set(socketId, otherUser);
        addParticipantToUI(otherUser);

        // Create Peer Connection With Them.
        // isCallee = false: WE are the new joiner, so WE send the offer to each existing user.
        const pc = createPC(otherUser, false);
        sendOfferTo(otherUser, pc);
    }
});

/** 
  * When a new user joins the room, you are informed about him. 
  Create a PC object mapped to it. This newly joined user will send you an offer.
  * @param remoteUserData (Object) = {id:, username:, email:, socketId:}
*/
socket.on('user-joined', (remoteUserData)=>{

    // Extract user details.
    const {id, username, email, socketId} = remoteUserData;
    console.log(`SOCKET:ON:USER-JOINED: Username = ${username}, Socket ID = ${socketId}`);
    
    // Add this new User to your userMap.
    userMap.set(socketId, remoteUserData);
    
    // Update UI
    addParticipantToUI(remoteUserData);

    // Create Peer Connection with It.
    // isCallee = true: the new joiner (C) will send us the offer. We must not send one.
    createPC(remoteUserData, true);
});

socket.on("user-left", (remoteUserData)=>{
    // Extract user details.
    const {id, username, email, socketId} = remoteUserData;
    console.log(`SOCKET:ON:USER-LEFT: Username = ${username}, Socket ID = ${socketId}`);

    // Delete this user from User Map.
    userMap.delete(socketId);

    // Remove It's Peer Connection.
    const pc = pcMap.get(socketId);
    if (pc) pc.close();
    pcMap.delete(socketId);

    // Update UI.
    removeParticipantFromUI(remoteUserData.socketId);
});

/**
  * @param data (Object) = { meetCode, message, id, timestamp }
*/
function sendMessage(messageText){
    const date = new Date(Date.now());
    const localDate = date.toLocaleString('en-IN');
    
    socket.emit("chat-message", {
        meetCode: window.__MEETCODE,
        message: messageText,
        id: window.__USER.id,
        timestamp: localDate
    });
}


/**
  * When Some other User Sends Message
  * @param data (Object) = {sender: user, message: message, timestamp: timestamp }
*/
socket.on("chat-message", (data)=>{
    const {sender, message, timestamp} = data;
    console.log(`SOCKET:ON:CHAT-MESSAGE: Message from ${sender.username}`);
    displayChatMessage(data);
});


// ------------------------------------------------------------
// WebRTC METHODS AND EVENTS.
// ------------------------------------------------------------

/**
  * Existing user (Callee) receives the offer, answers it. 
  * @param offer (SDP Object)
  * @param senderUser (Object) = {id, username, email, socketId} 
*/
socket.on("offer", async ({offer, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:OFFER: From ${username}`);
    
    // When the new user-joined. We already created a PC Object For it and stored it in map.
    const pc = pcMap.get(senderUser.socketId);
    // Save its offer into Remote Description.
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushPendingCandidates(senderUser.socketId);

    // Create your answer and save in Local Description.
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send Answer through signaling server.
    socket.emit("answer", {
        answer: answer, 
        targetSocketId: socketId, 
        senderUser: {...window.__USER, socketId: socket.id}
    });
});

/**
  * Joining user (Caller) receives the answer and completes its own SDP setup.
  * @param answer (SDP Object)
  * @param senderUser (Object) = {id, username, email, socketId} 
*/
socket.on("answer", async ({answer, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:ANSWER: From ${username}`);
    // You created a map entry for this user in get-others.
    const pc = pcMap.get(senderUser.socketId);
    if (!pc) return;
    // "have-local-offer" is the ONLY state where receiving an answer makes sense.
    // It means: we sent an offer and we are actively waiting for their answer.
    // Any other state — "stable", "have-remote-offer", "closed" — means
    // this answer is unexpected. Applying it would throw. Ignore it instead.
    if (pc.signalingState !== "have-local-offer") {
        console.warn("Unexpected answer received. Current state:", pc.signalingState, "— ignoring.");
        return; // Do nothing. Do not throw. Just quietly discard it.
    }
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingCandidates(senderUser.socketId);
});

/**
  * When WebRTC Fires ICE Candidates, they are sent to others using socket.
  * The servers reads them, and send to other users.
  * We listen to these recieved ICE Candidate from others.
  * We listen each time another user fires them.
  * @param candidate (ICE Object)
  * @param senderUser (Object) = {id, username, email, socketId}
*/

socket.on("ice-candidate", async ({candidate, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:ICE-CANDIDATE: From ${username}`);
    
    const pc = pcMap.get(socketId);
    if (!pc || !candidate) return;

    // pc.remoteDescription is null until setRemoteDescription() has been called.
    if(pc.remoteDescription){
        try{
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn("ICE candidate error (possible race condition):", e);
        }
    } else {
        // If there is no waiting room for this person yet, create one.
        if(!pendingCandidates.has(senderUser.socketId)){
            pendingCandidates.set(senderUser.socketId, [])
        }

        pendingCandidates.get(senderUser.socketId).push(candidate);
    }
    
});

/**
  * Send signal to others about track on or off to instantly update other's UI.'
  * type = "on" | "off",
  * track = "audio" | "video" | "screen"
  * fromUser = {id, username, email, socketId}
  * toMeetCode = 6 digit code for room.
*/

/* Participant UI Element.
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
*/
socket.on("signal", (signal)=>{
    const {type, track, fromUser, toMeetCode} = signal;
    console.log(`SOCKET:ON:SIGNAL: From ${fromUser.username}`);

    const remoteUserDiv = $(`#p-container-${fromUser.socketId}`);
    // [0] gets the raw DOM element — .pause() and .srcObject are native DOM APIs,
    // not jQuery methods. Calling them on a jQuery wrapper silently does nothing.
    const remoteUserVideo = remoteUserDiv.find(`#p-video-${fromUser.socketId}`)[0];
    const remoteUserOverlay = remoteUserDiv.find(`#p-overlay-${fromUser.socketId}`);
    
    if(track === "audio"){
        // No visual change needed for audio on/off — could add a muted icon here later.
        if (type == "off"){}
        else if (type == "on"){}
    }
    if(track === "video"){
        if (type == "off"){
            // Detach the stream and show the profile overlay.
            remoteUserVideo.pause();
            remoteUserVideo.srcObject = null;
            remoteUserOverlay.fadeIn();
        }
        else if (type == "on"){
            // Stream will arrive via ontrack automatically — just hide the overlay.
            remoteUserOverlay.fadeOut();
        }
    }
    if(track === "screen"){
        if (type == "off"){
            remoteUserVideo.pause();
            remoteUserVideo.srcObject = null;
            remoteUserOverlay.fadeIn();
        }
        else if (type == "on"){
            remoteUserOverlay.fadeOut();
        }
    }
    
});

/**
  * Clears HashMaps and tracks. Runs when user just closes tab instead of properly clicking leave button.
*/
function handleUserLeft(){
    console.log("RTC:CLEANUP: Cleaning up WebRTC and Socket State...");
    pcMap.forEach((pc, socketId) => {
        pc.close();
        const user = userMap.get(socketId);
        console.log(`RTC:CLEANUP | Closed connection with ${socketId} = ${user?.username}`);
    });
    pcMap.clear();

    // Stop all local media tracks so the camera/mic light turns off.
    if (camStream) {
        camStream.getTracks().forEach(track => track.stop());
        camStream = null;
        audioTrack = null;
        videoTrack = null;
        console.log("RTC:CLEANUP | Camera and microphone tracks stopped");
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        screenTrack = null;
        console.log("RTC:CLEANUP | Screen share tracks stopped");
    }

    userMap.clear();
    window.__MEETCODE = null;

    if (socket.connected) {
        socket.disconnect();
    }
}

export {
    userMap, pcMap, joinRoom, handleUserLeft, sendMessage,
    camStream, audioTrack, videoTrack, screenStream, screenTrack,
    toggleAudio, toggleVideo, toggleScreen
}
