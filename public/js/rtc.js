
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

var userMap = {};
var pcMap = {};

const iceConfig = {
  iceServers: [ {urls: 'stun:stun.l.google.com:19302'} ]
}

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

function createPC(remoteUser){
    // Create a new WebRTC object, for remote user.
    const pc = new RTCPeerConnection(iceConfig);

    // Create mapping to other user and its PC Object.
    pcMap.set(remoteUser.socketId, pc);

    // If a local stream is present, add it and send to others.
    if(window.__LOCALSTREAM){
        windw.__LOCALSTREAM.getTracks().forEach(track => pd.addTrack(track, window.__LOCALSTREAM));
    }

    // Fired automatically when other peer calls `addTrack()`
    pc.ontrack = (event) => {
        const vid = document.getElementById(`video-${remoteUser.socketId}`);
        if (vid && e.streams[0]) vid.srcObject = e.streams[0];
    };

    // Fired Automatically when you call addTrack.
    pc.onnegotiationneeded = async () => {
        if (pc.signalingState !== "stable") return; // guard against concurrent triggers
        await sendOfferTo(remoteUser, pc);
    };
    
    // Fired Automatically after setLocalDescription();
    pc.onicecandidate = (event) => {
        if (event.candidate){
            socket.emit("ice-candidate", { candidate: e.candidate, targetSocketId: remoteUser.socketId });
        }
    };

    // Fired each time connection state changes.
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") pc.restartIce();
    };
    return pc;
}

async function sendOfferTo(remoteUser, pc) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // ICE candidate generation starts automatically in the background now.
    socket.emit("offer", { 
        offer: offer, 
        targetSocketId: remoteUser.socketId, 
        senderUser: window.__USER 
    });
}

socket.on("connect", ()=>{
    // Add Socket ID to THIS user's global object.'
    window.__USER = {...window.__USER, socketId: socket.id};
    console.log(`SOCKET:ON:CONNECT: Connected with Socket ID = ${socket.id}`);
});

socket.on("disconnect", ()=>{
    window.__USER = {...window.__USER, socketId: null};
    console.log(`SOCKET:ON:CONNECT: Disconnected from Socket ID = ${socket.id}`);
});

/** When you join a room, you get list of participants already in it.
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
        sendOfferTo(user, pc);
    }
});

/** When a new user joins the room, you are informed about him.
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
    removeParticipantFromUI(remoteUserData);
});

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
socket.on("offer", ({offer, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:OFFER: From ${username}`);
    
    // When the new user-joined. We already created a PC Object For it and stored it in map.
    const pc = pcMap.get(senderUser.socketId);
    // Save its offer into Remote Description.
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create your answer and save in Local Description.
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send Answer through signaling server.
    socket.emit("answer", {
        answer: answer, 
        targetSocketId: socketId, 
        senderUser: window.__USER
    });
});

/**
  * Joining user (Caller) receives the answer and completes its own SDP setup.
  * @param answer (SDP Object)
  * @param senderUser (Object) = {id, username, email, socketId} 
*/
socket.on("answer", ({answer, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:ANSWER: From ${username}`);
    // You created a map entry for this user in get-others.
    const pc = pcMap.get(senderUser.socketId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

/**
  * When WebRTC Fires ICE Candidates, they are sent to others using socket.
  * The servers reads them, and send to other users.
  * We listen to these recieved ICE Candidate from others.
  * We listen each time another user fires them.
  * @param candidate (ICE Object)
  * @param senderUser (Object) = {id, username, email, socketId}
*/

socket.on("ice-candidate", ({candidate, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:ICE-CANDIDATE: From ${username}`);
    
    const pc = pcMap.get(socketId);
    if(pc && candidate){
        try{
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn("ICE candidate error (possible race condition):", e);
        }
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
    currentMeetCode = null;

    if (socket.connected) {
        socket.disconnect();
    }
}

export {
    userMap, joinRoom, handleUserLeft
}
