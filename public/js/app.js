/*
Each time user opens a different page, the whole JS re-loaded, thus, this file executeds 
from 1st line to last, re-initializing the global variables. To maintain state:
- We store important values in localStorage, which is unaffected by page reloads, thus data persists.
- We create a method, that is run automatically on each page load, setting global variable values.
*/

import {
    showModal, getUserInitials, 
    generateMeetCode, validateCode, getURLParameter
} from './utils.js'

import {
  setLocalStream, setMeetCode, 
  joinRoom, sendChatMessage, addTrackToPeer, removeTrackFromPeer, handleUserLeft,
  getUsers
} from './webRTC.js';

// GLOBAL VARIABLES
var USER = {};
var ISLOGGED = false;
var MEETCODE = 0;
var localStream = null;

var isScreenSharing = false;
var screenTrack = null;

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

/**
  * Synchronizes authentication state across pages.
*/
function syncState(){
    // Fetch user details from local storage kept at time of login and signup.
    const user = JSON.parse(localStorage.getItem("user"));

    // If found a user, set global variables shared accross files.
    if (user){
        window.__USER = user;
        window.__ISLOGGED = true;
        window.__USER_INITS = getUserInitials(window.__USER.username);
    }
}

//  ----------------- MANAGE GLOBAL VARIABLE VALUES ----------------- 
function syncState(){
  // First check if we have a user stored in localStorage.
  const storedUser = JSON.parse(localStorage.getItem("user"));
  
  // If we do have one, define global variables
  if (storedUser) {
    USER = storedUser;
    ISLOGGED = true;
  }

  // If user is logged In...
  if(ISLOGGED){
    // Convert Sign In Button to Sign Out Button.
    $("#signin-btn").text("Sign Out").attr("href", "#").attr("id", "signout-btn");
    // Show user profile pic with his initials.
    $("#profile-pic").text(getUserInitials(USER.username)).show();

    // If Logged In and on Auth page, redirect to home.
    if (window.location.pathname.includes("auth")) {
      window.location.href = "/";
    }

    // If Logged In and on Rooms Page, get meeting code.
    if (window.location.pathname.includes("room")) {
      // Show meeting code in Navbar
      const navMeetCode = $("#nav-meet-code");
      const idFromURL = getURLParameter("meetID");
      if (idFromURL) {
        MEETCODE = idFromURL;
        navMeetCode.text(MEETCODE);
      } else {
        // If we could not get meeting code. Redirect to Home.
        // Show The Error in Pop Up Modal
        showModal("Missing Code", "Meeting Code Could Not be Found");

        // Redirect to Home After 3 seconds.
        setTimeout(()=>{ window.location.href = "/"; }, 3000);
      }
    } 
  }
  // Else, user is NOT logged in,
  else {
    // Change Sign Out Button to Sign In
    $("#signout-btn").text("Sign In").attr("href", "/auth").attr("id", "signin-btn");
    // Hide Profile Picture.
    $("#profile-pic").hide()

    // If Not Logged In and Vising Rooms Page, redirect to home.
    if(window.location.pathname.includes("room")){
      window.location.href = "/";
    }
  }  
}

// ----------------- Start Media Stream ----------------- 

/*
VIDEO BUTTON CLICKED
    ├── localStream is null?
    │       └── YES → call enableVideo()
    ├── localStream has a live video track?  (.getVideoTracks()[0]?.readyState === "live")
    │       └── YES → call disableVideo()
    └── localStream exists but no live video track?
            └── call enableVideo()

MIC BUTTON CLICKED
    ├── localStream is null?
    │       └── YES → call enableAudio()
    ├── localStream has NO audio track?  (.getAudioTracks().length === 0)
    │       └── YES → call enableAudio()
    └── localStream HAS an audio track?
            └── call toggleMute()
*/


async function enableVideo() {
    try {
        // 1. Request ONLY video from the browser (audio: false).
        //    Store it in a temporary variable, NOT directly in localStream.
        //    This is because localStream may already exist with an audio track inside it.
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        // 2. Extract the video track from the temporary stream.
        const videoTrack = tempStream.getVideoTracks()[0];

        // 3. Check if localStream already exists (an audio-only stream may already be running).
        //    IF localStream exists  → insert the new video track into the existing stream.
        //    IF localStream is null → this is the very first media action, assign directly.
        if (localStream) {
            localStream.addTrack(videoTrack);
        } else {
            localStream = tempStream;
        }
        
        // Set LocalStream variable in webRTC.js
        setLocalStream(localStream);
        addTrackToPeer(videoTrack, localStream);

        // 4. Point the video element at localStream.
        //    srcObject must be set to null first to force the browser to re-read the stream.
        //    Without this, the browser may not detect the newly added track.
        const videoElement = document.getElementById("vid-pinned-video");
        videoElement.srcObject = null;
        videoElement.srcObject = localStream;
        videoElement.play();

        // 5. Hide the overlay and mark the video button as active.
        $("#vid-pinned-overlay").fadeOut();
        $("#video-btn").addClass("active");

    } catch (error) {
        // getUserMedia can fail if the user denies permission or no camera is found.
        console.error("enableVideo failed:", error);
        showModal("Camera Error", "Could not access camera. Please check your permissions.");
    }
}

function disableVideo() {
    // Guard: if no stream exists at all, there is nothing to disable.
    if (!localStream) {
        showModal("Camera Error", "No active stream found.");
        return;
    }

    // 1. Get the current video track from the stream.
    const videoTrack = localStream.getVideoTracks()[0];

    // 2. Guard: if no video track exists, or it is already dead, return early.
    if (!videoTrack || videoTrack.readyState !== "live") {
        showModal("Camera Error", "Video is already disabled.");
        return;
    }

    // 3. Kill the hardware. Camera LED turns off immediately.
    //    After this call, videoTrack.readyState becomes "ended" permanently.
    videoTrack.stop();

    // 4. Remove the dead track from the stream.
    //    A stopped track cannot be restarted — keeping it causes problems.
    localStream.removeTrack(videoTrack);
    removeTrackFromPeer(videoTrack);

    // 5. Show the overlay and mark the video button as inactive.
    $("#vid-pinned-overlay").fadeIn();
    $("#video-btn").removeClass("active");
}

async function enableAudio() {
    try {
        // 1. Request ONLY audio from the browser (video: false).
        //    Store it temporarily — localStream may already exist with a video track.
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });

        // 2. Extract the audio track from the temporary stream.
        //    A freshly created track from getUserMedia is always enabled by default.
        //    Setting .enabled = true explicitly is redundant and unnecessary.
        const audioTrack = tempStream.getAudioTracks()[0];

        // 3. Check if localStream already exists (a video-only stream may already be running).
        //    IF localStream exists  → insert the audio track into the existing stream.
        //    IF localStream is null → this is the very first media action, assign directly.
        if (localStream) {
            localStream.addTrack(audioTrack);
        } else {
            localStream = tempStream;
        }
        // Set LocalStream variable in webRTC.js
        setLocalStream(localStream);
        addTrackToPeer(audioTrack, localStream);
        // 4. Mark the mic button as active.
        $("#mic-btn").addClass("active");

    } catch (error) {
        // getUserMedia can fail if the user denies permission or no microphone is found.
        console.error("enableAudio failed:", error);
        showModal("Microphone Error", "Could not access microphone. Please check your permissions.");
    }
}

function disableAudio() {
    // Guard: if no stream exists at all, there is nothing to disable.
    if (!localStream) {
        showModal("Microphone Error", "No active stream found.");
        return;
    }

    // 1. Get the current audio track from the stream.
    const audioTrack = localStream.getAudioTracks()[0];

    // 2. Guard: if no audio track exists, or it is already dead, return early.
    if (!audioTrack || audioTrack.readyState !== "live") {
        showModal("Microphone Error", "Microphone is already disabled.");
        return;
    }

    // 3. Kill the hardware. Microphone turns off immediately.
    //    After this call, audioTrack.readyState becomes "ended" permanently.
    audioTrack.stop();

    // 4. Remove the dead track from the stream.
    //    A stopped track cannot be restarted — keeping it causes problems.
    localStream.removeTrack(audioTrack);
    removeTrackFromPeer(audioTrack);

    // 5. Mark the mic button as inactive.
    $("#mic-btn").removeClass("active");
}

async function shareScreen(){
  try{
    const screenStream = await navigator.mediaDevices.getDisplayMedia( { video: true } );

    screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.contentHint = "detail";
    addTrackToPeer(screenTrack, screenStream);

    const pinnedVideo = document.getElementById("vid-pinned-video");
    pinnedVideo.srcObject = screenStream;
    pinnedVideo.play();
    $("#vid-pinned-overlay").fadeOut();

    isScreenSharing = true;
    $("#screen-btn").addClass("active");

    screenTrack.onended = () => stopScreenShare();
    console.log("SCREEN: Screen sharing started");
  }
  catch (e) {
    console.error(`Error Occured: ${e}`);
  }
}

function stopScreenShare() {
    if (!screenTrack) return; // guard: already stopped (prevents double-call from onended)

    // 1. Stop the OS screen capture. The track is permanently ended after this.
    screenTrack.stop();

    // 2. Remove it from all peer connections so peers stop receiving it
    removeTrackFromPeer(screenTrack);

    // 3. Clear our reference
    screenTrack = null;

    // 4. Restore the pinned slot to your local camera (or overlay if camera is off)
    const pinnedVideo   = document.getElementById("vid-pinned-video");
    const pinnedOverlay = document.getElementById("vid-pinned-overlay");

    if (localStream && localStream.getVideoTracks()[0]?.readyState === "live") {
        pinnedVideo.srcObject = localStream;
        pinnedVideo.play();
        pinnedOverlay.style.display = "none";
    } else {
        pinnedVideo.srcObject = null;
        pinnedOverlay.style.display = "flex";
    }

    // 5. Update button and flag
    isScreenSharing = false;
    $("#screen-btn").removeClass("active");

    console.log("SCREEN: Screen sharing stopped");
}

function displayChatMessage(data){
  const chatCont = $("#chat-interface-body");
  const isMe = data.sender.userId === USER.id;
  const bubbleClass = isMe ? "sent-by-me": "sent-by-other";

  const msgHTML = `
    <div class="msg-bubble ${bubbleClass}">
        <p><strong>${isMe ? "You" : data.sender.username}:</strong> ${data.message}</p>
    </div>
  `;

  chatCont.append(msgHTML);
  // Auto-scroll to the bottom of the chat
  chatCont.scrollTop(chatCont[0].scrollHeight);
}

// Make it accessible to webRTC.js
window.displayChatMessage = displayChatMessage;

function showParticipantsModal() {
    const usersMap = getUsers();
    const list     = document.getElementById("participants-list");

    // Clear previous content so stale rows don't appear if modal is reopened
    list.innerHTML = "";

    usersMap.forEach((user) => {
        const isMe     = user.userId === USER.id;
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

        list.innerHTML += row;
    });

    // Show participant count in the title
    document.getElementById("participants-modal-title").textContent = `In this call (${usersMap.size})`;

    $(".participants-modal").show();
    $(".participants-modal-overlay").show();
}

// ============================================================
// PINNING SYSTEM
// ============================================================

/*
  SIMPLE EXPLANATION:
  Think of the pinned container and the side-grid cards as picture frames.
  A "frame" doesn't own the photo — it just holds whatever photo you put in it.
  When you pin someone, you're swapping which photo goes in which frame.
  The KEY insight: after the swap, we write a sticky note on each frame that says
  "this frame currently holds socketId=XYZ". Every other part of the code reads
  that sticky note FIRST, then decides which frame to update.

  TECHNICAL EXPLANATION:
  We maintain a single source of truth: `data-active-socket` attributes on both
  the pinned container and every side-grid participant card. When a stream event
  fires (track received, camera muted, user left), the handler calls
  `getContainerForSocket(socketId)` which scans the DOM for whichever element
  currently bears that socket's active-socket attribute — not a hardcoded ID.
  This means swapping only needs to update the data attributes, and all
  downstream event handlers automatically follow the socket to its new container.
*/

// The local user's socket ID is not known at app.js init time (it's set by webRTC.js
// after socket connection). We use a sentinel value that signals "local user owns
// the pinned slot" on initial load. webRTC.js calls setPinnedSocket(socket.id)
// once connected.
const LOCAL_SENTINEL = "__local__";

// On page load, the pinned container represents the local user.
// We mark it with a sentinel so getContainerForSocket can find it before
// the real socket ID is known.
function initPinningState() {
  const pinnedContainer = document.getElementById("vid-pinned");
  if (pinnedContainer) {
    pinnedContainer.dataset.activeSocket = LOCAL_SENTINEL;
  }
}

/*
  getContainerForSocket(socketId)

  Returns the DOM element (either #vid-pinned or a .participant card) that
  currently holds the given socket's video and overlay.
  Returns null if no container is found (user not yet in DOM).
*/
function getContainerForSocket(socketId) {
  // Check the pinned container first (most common hot path after a pin).
  const pinned = document.getElementById("vid-pinned");
  if (pinned && pinned.dataset.activeSocket === socketId) {
    return pinned;
  }
  // Fall back to scanning the side grid.
  return document.querySelector(`#vid-others [data-active-socket="${socketId}"]`) || null;
}

/*
  getVideoForSocket(socketId)
  getOverlayForSocket(socketId)

  Thin wrappers so call sites stay readable.
*/
function getVideoForSocket(socketId) {
  const container = getContainerForSocket(socketId);
  if (!container) return null;
  return container.querySelector("video");
}

function getOverlayForSocket(socketId) {
  const container = getContainerForSocket(socketId);
  if (!container) return null;
  // The pinned container uses #vid-pinned-overlay; side cards use .participant-overlay.
  // We do NOT care about the ID — we just grab whatever overlay element lives
  // inside this container. That way the function works identically for both slots.
  return container.querySelector(".participant-overlay, #vid-pinned-overlay");
}

// Expose to webRTC.js via window so it can call these without creating a circular import.
window.getVideoForSocket    = getVideoForSocket;
window.getOverlayForSocket  = getOverlayForSocket;
window.getContainerForSocket = getContainerForSocket;

// Called from webRTC.js once the socket connects so the pinned slot gets its real ID.
function setPinnedSocketToLocal(realSocketId) {
  const pinned = document.getElementById("vid-pinned");
  if (pinned && pinned.dataset.activeSocket === LOCAL_SENTINEL) {
    pinned.dataset.activeSocket = realSocketId;
  }
}
window.setPinnedSocketToLocal = setPinnedSocketToLocal;


// ============================================================
// PARTICIPANT CLICK → PIN SWAP
// ============================================================

/*
  WHAT WE SWAP (data only, no DOM node moves):
    1. video.srcObject          — the MediaStream reference
    2. overlay text             — initials and name strings
    3. overlay visibility       — shown/hidden state
    4. data-active-socket       — THE CRITICAL PART: which socket lives in which frame

  WHAT WE DO NOT TOUCH:
    - Element IDs (CSS depends on #vid-pinned-overlay, #vid-pinned-overlay-profile, etc.)
    - CSS classes on any element
    - The DOM hierarchy / node positions

  WHY data-active-socket fixes both bugs:
    Bug 1 (Hardware Mute): After a swap, displayRemoteStream and showOverlayForSocket
          call getVideoForSocket(socketId) which reads data-active-socket, so they
          always find the correct physical container regardless of how many pins
          have occurred.

    Bug 2 (CSS Distortion): We no longer copy text into the wrong-class element.
          The pinned overlay profile uses #vid-pinned-overlay-profile (styled as
          .user-initials). The side-card profile uses .participant-profile. After
          the swap the same element keeps its class — only the text inside changes.
          Both elements already had text in them before the swap; the font-size
          discrepancy was caused by the OLD code writing the pinned slot's
          .user-initials text into a .participant-profile element during a
          re-render. Now the classes never migrate.
*/

$(document).on("click", ".participant", function () {
  const partContainer  = this; // The side-grid card that was clicked.
  const pinnedContainer = document.getElementById("vid-pinned");

  // ---- 1. Gather video elements ----
  const pinnedVideo = pinnedContainer.querySelector("video");
  const partVideo   = partContainer.querySelector("video");

  // ---- 2. Gather overlay elements ----
  // Pinned slot: uses specific IDs wired up by the HTML.
  const pinnedOverlay  = document.getElementById("vid-pinned-overlay");
  const pinnedProfile  = document.getElementById("vid-pinned-overlay-profile");
  const pinnedName     = document.getElementById("vid-pinned-overlay-name");

  // Side card: uses class-based selectors so we stay agnostic of dynamic IDs.
  const partOverlay  = partContainer.querySelector(".participant-overlay");
  const partProfile  = partContainer.querySelector(".participant-profile");
  const partName     = partContainer.querySelector(".participant-name");

  // ---- 3. Swap MediaStream references ----
  const tempStream      = pinnedVideo.srcObject;
  pinnedVideo.srcObject = partVideo.srcObject;
  partVideo.srcObject   = tempStream;

  if (pinnedVideo.srcObject) pinnedVideo.play();
  if (partVideo.srcObject)   partVideo.play();

  // ---- 4. Swap overlay text (initials and name) ----
  const tempInitials    = pinnedProfile.innerText;
  pinnedProfile.innerText = partProfile.innerText;
  partProfile.innerText   = tempInitials;

  const tempName      = pinnedName.innerText;
  pinnedName.innerText  = partName.innerText;
  partName.innerText    = tempName;

  // ---- 5. Swap overlay visibility ----
  // Read computed style to handle cases where inline style is absent (initial render).
  const pinnedOverlayVisible = window.getComputedStyle(pinnedOverlay).display !== "none";
  const partOverlayVisible   = window.getComputedStyle(partOverlay).display   !== "none";

  pinnedOverlay.style.display = partOverlayVisible   ? "flex" : "none";
  partOverlay.style.display   = pinnedOverlayVisible ? "flex" : "none";

  // ---- 6. Swap data-active-socket attributes ----
  // This is what makes all future event handlers (ontrack, onmute, user-left)
  // automatically target the correct physical container.
  const tempSocketId               = pinnedContainer.dataset.activeSocket;
  pinnedContainer.dataset.activeSocket = partContainer.dataset.activeSocket;
  partContainer.dataset.activeSocket   = tempSocketId;

  console.log(
    `PIN:SWAP | Pinned container now shows socket=${pinnedContainer.dataset.activeSocket}, ` +
    `side card ${partContainer.id} now shows socket=${partContainer.dataset.activeSocket}`
  );
});


// When Page is Loaded and JS is ready to run.
$(document).ready(function () {
  
  // First, sync state, regardless of Page.
  syncState();
  window.__currentUserId = USER.id;

  // Initialize pinning state so the pinned container gets its sentinel attribute.
  if (window.location.pathname.includes("room")) {
    initPinningState();
  }

  // -----------------------------------------------------------------
  // HOME PAGE
  // -----------------------------------------------------------------

  /*
    ================ What Happens When User Clicks on "New Meeting" Button(s) ================
    There are two "New Meet Buttons", click on each of them should starte a new meet.
    First check if user is logged in, if not, show error. If yes, generate new code.
    Then, redirect to new room.html. Since meet code is adding as query param in URL,
    the MEETCODE is set when room.html is loaded, by reading query parameter.
  */
  $(".new-meet-btn").click(function () {
    if (!ISLOGGED) {
      const title = "Un-Authorized Activity";
      const body = "You need to be loggedin in to start a new meeting";
      showModal(title, body);
      return;
    } else {
      // Generates a random number between 100,000 and 999,999
      const meetCode = generateMeetCode();
      window.location.href = "/room?meetID=" + meetCode;
    }
  });

  /* 
    ================ What happens when user clicks on "Join" Button ================
    If user has custom code to input, first validate the input code to be a 6 digit number.
    Once validated, redirect to room.html, setting this code in query parameter.
  */
  $("#join-btn").click(function () {
    // Get input tag in which code is written.
    const codeElement = $("#code-input");
    // Get the text written in the element by user.
    const code = codeElement.val();

    // If something is written.
    if (code) {
      // Validate Code using the utility function defined above.
      const verified = validateCode(code);

      // If validated, redirect to room.html.
      if (verified) {
        window.location.href = "/room?meetID=" + code;
      } else {
        // If not validated, show error in Modal.
        const title = "Invalid Code";
        const body = "Please enter a valid 6-digit code";
        showModal(title, body);
        return;
      }
    } else {
      // If nothing was written, highlight input tag.
      codeElement.focus();
      codeElement.css("border", "2px solid var(--danger");
    }
  });

  /*
    ================ What Happens When User clicks on Sign In Button ================
    Just Redirect to auth.html Page, If he is logged in, he would see Sign Out Button instead.
  */
  $("#signin-btn").click(function () {
    window.location.href = "/auth";
  });

  /*
    ================ What Happens When User clicks on Sign Out Button ================
    Remove user details from localStorage. Reset global variables.
  */
  $("#signout-btn").click(function () {
    localStorage.removeItem("user");
    ISLOGGED = false;
    USER = {};
    window.location.href = "/";
  });


  // -----------------------------------------------------------------
  // Auth PAGE
  // -----------------------------------------------------------------
  
  /*
    The Sign In and Sign Up Forms are contained within same div.
    Toggle between them using the Tab Buttons.
  */

  // Select Tab Buttons
  const signinTab = $("#signin-tab");
  const signupTab = $("#signup-tab");
  // Select The Container corresponding to tab buttons.
  const signInContent = $("#signin-tab-content");
  const signUpContent = $("#signup-tab-content");

  // When Sign In Tab is clicked, show its content, hide other's.
  signinTab.click(function () {
    signinTab.addClass("active");
    signupTab.removeClass("active");
    signUpContent.hide();
    signInContent.show();
  });

  // When Sign Up Tab is clicked, show its content, hide other's.
  signupTab.click(function () {
    signinTab.removeClass("active");
    signupTab.addClass("active");
    signInContent.hide();
    signUpContent.show();
  });

  /*
    ================ HANDLING FORM SUBMISSIONS ================
    Both Forms are in their separate <form></form> tags. But, behavious is similar.
  */
  $("#signup-form, #signin-form").on("submit", function (event) {

    // Do not allow the form to be submitted when Submit Button is clicked.
    event.preventDefault();

    // Get Form Id
    const formId = $(this).attr("id");

    // Based on Id, decide whether is is "Sign Up" or "Sign In"
    const apiEndPoint = (formId === "signup-form") ? "/auth/signup" : "/auth/signin";

    // Use FormData class to convert form's data into JSON Format.
    const formData = Object.fromEntries(new FormData(this));

    // Send Request to Backend.
    $.ajax({
      url: apiEndPoint,
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify(formData),

      /* 
        What to do when server sends a response.
        This is what Server sends: { success: true, message: "Login Successfull", user: payload }
        - payload is an object = {id, username, email}
      */
      success: function (res) {
        // If server response success.
        if (res.success){
          // Store returned user in localStorage.
          localStorage.setItem("user", JSON.stringify(res.user));

          // Set Global Variables.
          USER = res.user;
          ISLOGGED = true;

          // Redirect to Home Page.
          window.location.href = "/";
        }
      },
      error: function (xhr) {
        console.error(`Error During Auth = ${xhr.statusText}`);
        return showModal("Error", `${xhr.statusText}`);
      },
    });
  });


  // -----------------------------------------------------------------
  // ROOM PAGE
  // -----------------------------------------------------------------

  if (window.location.pathname.includes('room')){
    setMeetCode(MEETCODE);
    joinRoom(MEETCODE, USER.id, USER.username, USER.email);
  }

  // When User Clicks on Share Link Button.
  $(".share-link-btn").on("click", function () {
    navigator.clipboard.writeText(MEETCODE).then(() => {
      const title = "Meeting Link Copied";
      const body = `Meeting Link = ${MEETCODE} has been copied to Clipboard`;
      showModal(title, body);
    });
  });

  // There are two Leave Call Buttons. When User clicks on either of them,
  $(".leave-call-btn, button#hangup-btn").on("click", function () {
    // Stop all active tracks before leaving to release hardware.
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    // Reset MEETCODE and redirect to Home.
    MEETCODE = 0;
    setMeetCode(MEETCODE);
    handleUserLeft();
    window.location.href = "/";
  });

  // Three-dot menu button → open the participants modal
  $("#menu-btn").on("click", function () {
      showParticipantsModal();
  });

  // ✕ button inside the modal → close it
  $("#close-participants-modal").on("click", function () {
      $(".participants-modal").hide();
      $(".participants-modal-overlay").hide();
  });

  // Clicking the dark backdrop → also close
  $(".participants-modal-overlay").on("click", function () {
      $(".participants-modal").hide();
      $(this).hide();
  });

  let sendBtn = $("#chat-input-container button");
  let chatInput = $("#chat-input-container input");
  
  sendBtn.on("click", ()=>{
      chatInput = $("#chat-input-container input");
      const msg = chatInput.val();
      if (!msg.trim()) return chatInput.focus();

      sendChatMessage(MEETCODE, USER.id, msg);
      chatInput.val("")
  });

  chatInput.on("keypress", (e) => { if (e.which === 13) sendBtn.click(); });

  // Initiate Pinned User Display Elements.
  $("#vid-pinned-overlay-profile").text(getUserInitials(USER.username));
  $("#vid-pinned-overlay-name").text(USER.username);

  $("#video-btn").on("click", async function() {
    if (!localStream) {
      await enableVideo();
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === "live") {
      disableVideo();
    } else {
      await enableVideo();
    }
  });

  // ================ MIC BUTTON ================
  $("#mic-btn").on("click", async function () {
    if (!localStream) {
      await enableAudio();
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];

    if (audioTrack && audioTrack.readyState === "live") {
      disableAudio();
    } else {
      await enableAudio();
    }
  });

  $("#screen-btn").on("click", async function () {
      if (!isScreenSharing) {
          await shareScreen();
      } else {
          stopScreenShare();
      }
  });

  // When user closes tab, call handleUserLeft() to clear connections.
  $(window).on("beforeunload", function() {
      handleUserLeft();
  });
});
