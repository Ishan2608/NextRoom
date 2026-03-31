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

function showParticipantsModal(userMap) {
    if (userMap.size <=1) {
        return showModal("All Alone", "You are the only one in this room");
    }
    const users = userMap.values();
    const list = document.getElementById("participants-list");
    let allRows = ``;
    // Clear previous content so stale rows don't appear if modal is reopened
    list.innerHTML = "";

    users.forEach((user) => {
        const isMe = user.id === USER.id;
        const initials = getUserInitials(user.username);
        const row = `
            <div style="display:flex; align-items:center; gap:12px;
                        padding:10px 12px; border-radius:8px;
                        background:rgba(255,255,255,0.05);">

                <div style="width:40px; height:40px; border-radius:50%;
                            background:#6c63ff; flex-shrink:0;
                            display:flex; align-items:center; justify-content:center;
                            font-size:14px; font-weight:600; color:#fff;">
                    ${initials}
                </div>

                <div style="overflow:hidden;">
                    <div style="font-size:14px; font-weight:500; white-space:nowrap;
                                overflow:hidden; text-overflow:ellipsis;">
                        ${user.username}
                        ${isMe ? '<span style="font-size:11px; opacity:0.5; margin-left:4px;">(you)</span>' : ''}
                    </div>
                    <div style="font-size:12px; opacity:0.55; white-space:nowrap;
                                overflow:hidden; text-overflow:ellipsis;">
                        ${user.email}
                    </div>
                </div>
            </div>
        `;
        allRows += row;
    });
    list.innerHTML = allRows;
    // Show participant count in the title
    document.getElementById("participants-modal-title").textContent = `In this call (${userMap.size})`;

    $(".participants-modal").show();
    $(".participants-modal-overlay").show();
}

function displayChatMessage(data){
  const chatCont = $("#chat-interface-body");
  const isMe = data.sender.id === window.__USER.id;
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


function toggleAudio(){}

function toggleVideo(){}

function toggleScreen(){}

export {
    showModal, getUserInitials, 
    generateMeetCode, validateCode, getURLParameter,
    addParticipantToUI, removeParticipantFromUI, showParticipantsModal,
    displayChatMessage,
    toggleAudio, toggleVideo, toggleScreen
};
