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
const camStream = null;
const videoTrack = null;
const audioTrack = null;

// Screen capture
const screenStream = null
const screenTrack = null;

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

async function toggleAudio(){
    
}

async function toggleVideo(){
    
}

async function toggleScreen() {
    
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
  * Defines each event listerner of PC Object.
*/
function createPC(remoteUser){
    // Create a new WebRTC object, for remote user.
    const pc = new RTCPeerConnection(iceConfig);

    // Create mapping to other user and its PC Object.
    pcMap.set(remoteUser.socketId, pc);

    // Fired automatically when other peer calls `addTrack()`
    pc.ontrack = (event) => {
        const vid = document.getElementById(`video-${remoteUser.socketId}`);
        if (vid && e.streams[0]) vid.srcObject = event.streams[0];
    };

    // Fired Automatically when you call addTrack.
    /*
        WHAT HAPPENS WITHOUT THE GUARD

        addTrack(audioTrack) fires onnegotiationneeded
            → signalingState = "stable" → send offer ✓ → signalingState = "have-local-offer"

        addTrack(videoTrack) fires onnegotiationneeded (milliseconds later)
            → signalingState = "have-local-offer" → try to send another offer
            → setLocalDescription() THROWS because an offer is already in flight ✗

        WHAT HAPPENS WITH THE GUARD

        addTrack(audioTrack) fires onnegotiationneeded
            → signalingState = "stable" → send offer ✓ → signalingState = "have-local-offer"

        addTrack(videoTrack) fires onnegotiationneeded
            → signalingState = "have-local-offer" → guard triggers → return early (skip)

        ... offer is answered, cycle completes, signalingState = "stable" again ...

        Browser re-fires onnegotiationneeded automatically
            → signalingState = "stable" → send offer ✓ (now includes both audio + video)
    */
    pc.onnegotiationneeded = async () => {
        // Before doing anything, check whether the connection is in a
        // "calm" state. "stable" means: no offer is currently in flight,
        // and we are not in the middle of processing someone else's offer.
        // It is the only state where creating a new offer is safe.
        if (pc.signalingState !== "stable") {

            // An offer is already being negotiated. Skip this trigger.
            // Do NOT retry. Do NOT queue this. Just return.
            // The browser will fire onnegotiationneeded again once
            // the current cycle completes and signalingState = "stable".
            console.log("Negotiation skipped — already negotiating. State:", pc.signalingState);
            return;
        }
        // Safe to proceed. signalingState is "stable", so we are the only
        // offer in flight. Send it.
        await sendOfferTo(remoteUser, pc);
    };
    
    // Fired Automatically after setLocalDescription();
    pc.onicecandidate = (event) => {
        if (event.candidate){
            socket.emit("ice-candidate", { 
                candidate: e.candidate, 
                targetSocketId: remoteUser.socketId,
                senderUser: {...window.__USER, socketId: socket.id}
            });
        }
    };

    // Fired each time connection state changes.
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    // Add any tracks currently active to this new connection.
    // This is what makes a new joiner see existing streams immediately.
    if (audioTrack) pc.addTrack(audioTrack, audioStream);
    if (videoTrack) pc.addTrack(videoTrack, videoStream);
    if (screenTrack) pc.addTrack(screenTrack, screenStream);
    // Adding these triggers onnegotiationneeded → the SDP offer will include them.

    // Send existing streams so that newly joined user can see shared tracks if any.
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
        const pc = createPC(otherUser);
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
    createPC(remoteUserData); // Since other sends offer, just create a map for them. Nothing else.
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
socket.on("signal", (signal)=>{
    console.log(`SOCKET:ON:SIGNAL: From ${username}`);
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

    if (window.__LOCALSTREAM){
        window.__LOCALSTREAM.getTracks().forEach(track => track.stop());
        window.__LOCALSTREAM = null;
        console.log("RTC:CLEANUP | Local media tracks stopped");
    }
    userMap.clear();
    window.__MEETCODE = null;

    if (socket.connected) {
        socket.disconnect();
    }
}

export {
    userMap, pcMap, joinRoom, handleUserLeft, sendMessage,
    camStream, audioTrack, videoTrack, screenStream, screenTrack
}
