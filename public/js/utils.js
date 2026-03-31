// -------- Utility Functions -------------
function showModal(title, message) {
    const modal = $(".modal");
    const modalOverlay = $(".modal-overlay");

    $(".modal-title").text(title);
    $(".modal-content").text(message);

    modal.show();
    modalOverlay.show();

    modalOverlay.click(function () {
      modalOverlay.hide();
      modal.hide();
    });
}

function getUserInitials(name) {  
    const parts = name.trim().split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
}

function generateMeetCode() {
    const min = 100000;
    const max = 999999;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Validate Meeting Code.
function validateCode(code) {
    const codeToNum = parseInt(code);
    let verified = false;
    if (code) {
      if (!isNaN(codeToNum) && code.length === 6) {
        verified = true;
      }
    }
    return verified;
}

function getURLParameter(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

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

function displayChatMessage(data){
  const chatCont = $("#chat-interface-body");
  const isMe = data.sender.id === USER.id;
  const bubbleClass = isMe ? "sent-by-me": "sent-by-other";

  const msgHTML = `
    <div class="msg-bubble ${bubbleClass}">
        <p><strong>${isMe ? "You" : data.sender.username}:</strong> ${data.message}</p>
        (<i> ${data.timestamp} </i>)
    </div>
  `;

  chatCont.append(msgHTML);
  // Auto-scroll to the bottom of the chat
  chatCont.scrollTop(chatCont[0].scrollHeight);
}

export {
    showModal, getUserInitials, 
    generateMeetCode, validateCode, getURLParameter,
    addParticipantToUI, removeParticipantFromUI, 
    displayChatMessage,
    toggleAudio, toggleVideo, toggleScreen
};
