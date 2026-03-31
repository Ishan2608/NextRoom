
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
});

socket.on("user-left", (remoteUserData)=>{
    // Extract user details.
    const {id, username, email, socketId} = remoteUserData;
    console.log(`SOCKET:ON:USER-LEFT: Username = ${username}, Socket ID = ${socketId}`);

    // Delete this user from User Map.
    userMap.delete(socketId);

    // Update UI.
    removeParticipantFromUI(remoteUserData);

    // Remove It's Peer Connection.
    // pcMap.delete(socketId);
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

function createPC(){
    const pc = new RTCPeerConnection();
    pcMap.set(window.__USER.socketId, pc);
    
    return pc;
}

function joinRoom(){
    console.log("Joining Room");
}

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

socket.on("offer", ({offer, senderUser})=>{
    const {id, username, email, socketId} = senderUser;
    console.log(`SOCKET:ON:OFFER: From ${username}`);
});
socket.on("answer", ({answer, senderUser})=>{
    console.log(`SOCKET:ON:ANSWER: From ${username}`);
});
socket.on("ice-candidate", ({candidate, senderUser})=>{
    console.log(`SOCKET:ON:ICE-CANDIDATE: From ${username}`);
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

export {
    userMap, joinRoom, handleUserLeft
}
