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
      });

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
      });

      // Send chat messages from user to user.
      socket.on("chat-message", ({meetCode, message})=>{
        
        const room = getRoom(meetCode);
        const user = room?.get(socket.id);        

        // Send message to room.
        if(!user){
            console.warn(`Message sent by unknown user`);
            return;
        }
        console.log(`SOCKET-EVENT:ON:SEND-MESSAGE: user = ${user.username} sent a message to room = ${meetCode}`);
        io.to(meetCode).emit("chat-message", { sender: user, message: message, timestamp: Date.now() });
        
      });

      socket.on("offer", ( { offer, meetCode } )=>{
        // TODO: Look up sender from rooms Map for logging.
        const user = getRoom(meetCode)?.get(socket.id);
        console.log(`SOCKET-EVENT:ON:OFFER: Recieved offer from ${user.username}`);
        
        // TODO: socket.to(meetCode).emit "offer", passing { offer }
        socket.io(meetCode).emit("offer", { offer });
        console.log(`SOCKET-EVENT:EMIT:OFFER: Sending offer from ${user.username} to room=${meetCode}`);
      });

      socket.on("answer", ( { answer, meetCode } )=>{
        // TODO: Look up sender from rooms Map for logging.
        const user = getRoom(meetCode)?.get(socket.id);
        console.log(`SOCKET-EVENT:ON:ANSWER: Recieved answer from ${user.username}`);
        
        socket.io(meetCode).emit("answer", { answer });
        console.log(`SOCKET-EVENT:EMIT:ANSWER: Sending answer from ${user.username} to room=${meetCode}`);
      });

    
      socket.on("ice-candidate", ( { candidate, meetCode } )=>{
        // console.log(`SOCKET-EVENT:ON:ICE-CANDIDATE: Recieved ICE-Candidate.`);
        socket.to(meetCode).emit("ice-candidate", { candidate });
      });

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
        
      });
      
      
    });


    // ----------------------------------------------------------
    // SIGNALLING EVENTS (WebRTC handshake, server just forwards these)
    // ----------------------------------------------------------

    // TODO: Listen for "offer" on this socket.
    // Receives: { offer, meetCode }
    // Inside:
    //   Forward to all others in the room.
    //   socket.to(meetCode).emit("offer", { offer })
    //   console.log("Offer forwarded in room:", meetCode)

    // TODO: Listen for "answer" on this socket.
    // Receives: { answer, meetCode }
    // Inside:
    //   Forward to all others in the room.
    //   socket.to(meetCode).emit("answer", { answer })
    //   console.log("Answer forwarded in room:", meetCode)

    // TODO: Listen for "ice-candidate" on this socket.
    // Receives: { candidate, meetCode }
    // Inside:
    //   Forward to all others in the room.
    //   socket.to(meetCode).emit("ice-candidate", { candidate })

    // ----------------------------------------------------------
    // CHAT EVENTS
    // ----------------------------------------------------------

    // TODO: Listen for "chat-message" on this socket.
    // Receives: { meetCode, userId, message, timestamp }
    // Inside:
    //   Forward to ALL sockets in the room INCLUDING the sender.
    //   Use: io.to(meetCode).emit("chat-message", { userId, message, timestamp })
    //   Note: io.to() includes the sender. socket.to() excludes the sender.
    //   For chat, the sender also needs to see their own message appear in the UI.

}

module.exports = {initSocket};
