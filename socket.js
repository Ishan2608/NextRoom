// socket.js
// This file handles all socket.io events on the server side.
// server.js will import this and pass the io instance into it.

/*
rooms = Map {
    "<meetCode>" => Map {
        "socket-id-abc" => { userId, username, email, socketId },
        "socket-id-xyz" => { userId, username, email, socketId }
    }
}

socket-id-abc is the unique string connecting a user and backend. The same is stored
along with user objects for easy logging.
*/
const rooms = new Map();

// Helper: given a meetCode, return the inner Map of users.
function getRoom(meetCode){
    return rooms.get(meetCode) ?? null;
}

// Helper: given a socketId, find which room it belongs to.
function getRoomBySocketId(socketId){
    for (const [meetCode, users] of rooms){
        if (users.has(socketId)) return meetCode;
    }
    return null;
}

// Helper: get all user detail objects in a room as an array.
function getUsersInRoom(meetCode) {
    const room = getRoom(meetCode);
    if (!room) return [];
    return Array.from(room.values());
}

// TODO: Export a function: initSocket(io)
// All socket logic goes inside this function.
// server.js calls initSocket(io) after creating the io instance.

function initSocket(io) {

    // TODO: Listen for a new socket connection.
    io.on("connection", (socket) => {
        // Frontend ends a socket object on connection event, through which that frontend is uniquely identified.
        console.log(`SOCKET-EVENT:ON:CONNECTION: Connected to socket = ${socket.id}`);

        // ----------------------------------------------------------
        // ROOM EVENTS
        // ----------------------------------------------------------

        // TODO: Listen for "join-room" on this socket.
        socket.on("join-room", ({ meetCode, userId, username, email }) => {
            // Put socket into the socket.io room.
            socket.join(meetCode); // this puts the socket into a named room.

            if (!rooms.has(meetCode)){
                // If this is the first user in Room, create a new room.
                rooms.set(meetCode, new Map());
            }

            // Register this user in the inner Map.
            const room = rooms.get(meetCode);
            room.set(socket.id, {userId: userId, username: username, email: email, socketId: socket.id});

            const participants = Array.from(room.values()); // Get list of all participants of this room
            const thisUserID = socket.id; // Stored ID of this user, joining in separately.
            // Get list of all users except this one.
            const others = participants.filter((user) => user.socketId !== thisUserID);
            // others = [{userId: , username: , email: , socketId: }, ...]

            // SEND THIS LIST OF OTHER PARTICIPANTS TO THIS USER to update his UI.
            socket.emit("get-others", others);

            console.log(`SOCKET:ON:JOIN-ROOM | user=${username} (id=${userId}) joined room=${meetCode}`);
            console.log(`SOCKET:ON:JOIN-ROOM | current users in room=${meetCode}:`, getUsersInRoom(meetCode));

            // Notify all OTHER sockets in that room that someone arrived.
            socket.to(meetCode).emit("user-joined", {userId: userId, username: username, email: email, socketId: socket.id});
            console.log(`SOCKET-EVENT:EMIT:USER-JOINED: User = ${username} joining Meet Code = ${meetCode}`);
        }); // <- Closing of: socket.on("join-room")

        socket.on("leave-room", ({meetCode})=>{
            // Get the Room
            const room = rooms.get(meetCode);
            // Get details of this user who emit the event.
            const user = room?.get(socket.id);

            if (room){
                // Remove this user's entry from room.
                room.delete(socket.id);
                console.log(`SOCKET-EVENT:ON:LEAVE-ROOM: user = ${user.username} left the room = ${meetCode}`);
                if(room.size == 0){
                    rooms.delete(meetCode);
                    console.log(`Room became empty, removing it from directory.`);
                }
            }

            // Notify Other users:
            socket.to(meetCode).emit("user-left", {
                userId: user?.userId,
                username: user?.username,
                email: user?.email,
                socketId: socket.id
            });

            // Leave the room.
            socket.leave(meetCode);
        }); // <- Closing of: socket.on("leave-room")

        // Send chat messages from user to user.
            socket.on("chat-message", ({ meetCode, message, userId, timestamp }) => {
                const room = getRoom(meetCode);
                const user = room?.get(socket.id);        

                if (!user) return;
                
                // Broadcast to everyone in the room
                io.to(meetCode).emit("chat-message", { 
                    sender: user, 
                    message: message, 
                    timestamp: timestamp || Date.now() 
                });
            }); // <- Closing of: socket.on("chat-message")

        // ----------------------------------------------------------
        // SIGNALLING EVENTS (WebRTC handshake, server just forwards these)
        // ----------------------------------------------------------

        socket.on("offer", ({ offer, targetSocketId, senderUser }) => {
            console.log(`SOCKET-EVENT:ON:OFFER: Received offer from ${senderUser.username} aimed at ${targetSocketId}`);
            socket.to(targetSocketId).emit("offer", { offer, senderUser });
        });

        socket.on("answer", ({ answer, targetSocketId, senderUser }) => {
            console.log(`SOCKET-EVENT:ON:ANSWER: Received answer from ${senderUser.username} aimed at ${targetSocketId}`);
            socket.to(targetSocketId).emit("answer", { answer, senderUser });
        });
        
        socket.on("ice-candidate", ({ candidate, targetSocketId, senderUser }) => {
            socket.to(targetSocketId).emit("ice-candidate", { candidate, senderUser });
        });
        /**
          * Send signal to others about track on or off to instantly update other's UI.'
          * type = "on" | "off",
          * track = "audio" | "video" | "screen"
          * fromUser = {id, username, email, socketId}
          * toMeetCode = 6 digit code for room.
        */
        socket.on("signal", (signal) => {
            const {type, track, fromUser, toMeetCode} = signal;
            const {id, username, email, socketId} = fromUser;
            console.log(`${username} sent ${type} signal for ${track} to Room = ${toMeetCode}`);
            // Notify other users
            socket.to(toMeetCode).emit("signal", signal)
        }); // <- Closing of: socket.on("signal")

        socket.on("disconnect", ()=> {
            // Get meet code which user left.
            const meetCode = getRoomBySocketId(socket.id);

            // If found,
            if (meetCode){
                // Get the HashMap of that Meeting Room.
                const room = getRoom(meetCode);
                // Get the user inside that HashMap.
                const user = room.get(socket.id);
                // Remove that user from the HashMap
                room.delete(socket.id);
                console.log(`SOCKET:DISCONNECT | user=${user?.username} (socketId=${socket.id}) dropped from room=${meetCode}`);

                if(room.size === 0){
                    rooms.delete(meetCode);
                    console.log("Room became empty, removing it from registry");
                    return;
                }

                // notify others if room is not empty:
                socket.to(meetCode).emit("user-left", {
                    userId: user?.userId,
                    username: user?.username,
                    email: user?.email,
                    socketId: socket.id
                });
            }else {
                console.log(`SOCKET-EVENT:ON:DISCONNECT | socketId=${socket.id} was not in any room`);
            }
            
        }); // <--- socket.on("disconnect")
    }); // <--- io.on("connection")
}

module.exports = {initSocket};
