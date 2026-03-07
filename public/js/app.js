// GLOBAL VARIABLES
var MEETCODE = 0;
var USER = {};
var ISLOGGED = false;
let localStream = null;

// 1. Define Utilities in Global Scope
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

function getUserInitials() {
  const name = USER.username || "User";
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

function syncAuthState() {
    const signinBtn = $("#signin-btn");
    const profilePic = $("#profile-pic");

    // if user is indeed logged in
    if (ISLOGGED) {
      signinBtn.text("Sign Out").attr("href", "#").attr("id", "signout-btn");
      profilePic.text(getUserInitials()).show();

      // Do not allow to visit auth page.
      if (window.location.pathname.includes("auth")) {
        window.location.href = "/";
      }

      // If user is Logged in and on Rooms PAGE
      if (window.location.pathname.includes("room")) {
        // Show meeting code in Navbar
        const navMeetCode = $("#nav-meet-code");
        const idFromURL = getURLParameter("meetID");
        if (idFromURL) {
          MEETCODE = idFromURL;
          navMeetCode.text(MEETCODE);
        }
        console.log(`MEETCODE = ${MEETCODE}`);
      }
    } else {
      profilePic.hide();
      signinBtn
        .text("Sign In")
        .attr("href", "auth.html")
        .attr("id", "signin-btn");
      if (window.location.pathname.includes("room")) {
        window.location.href = "/";
      }
    }
  }


async function startLocalStream(){
  try{
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const pinnedVideo = $("#vid-pinned-video")[0];
    if (pinnedVideo){
      pinnedVideo.srcObject = localStream;
      pinnedVideo.onloadedmetadata = () => pinnedVideo.play();
      $("#vid-pinned-overlay").hide();
    }
    return localStream;
  } catch(error){
    showModal("Something went Wrong", "Could not Load Media Device");
    return null;
  }
}

$(document).ready(function () {
  // 1. Get user details on each page load.
  const storedUser = JSON.parse(localStorage.getItem("user"));
  if (storedUser) {
    USER = storedUser;
    ISLOGGED = true;
  }

  // 3. Sync state for page when it reloads as the first thing.
  syncAuthState();

  $(".new-meet-btn").click(function () {
    if (!ISLOGGED) {
      const title = "Un-Authorized Activity";
      const body = "You need to be loggedin in to start a new meeting";
      showModal(title, body);
      return;
    }
    // Generates a random number between 100,000 and 999,999
    const meetCode = generateMeetCode();
    window.location.href = "/room?meetID=" + meetCode;
  });

  $("#join-btn").click(function () {
    const codeElement = $("#code-input");
    const code = codeElement.val();
    if (code) {
      const verified = validateCode(code);
      if (verified) {
        window.location.href = "/room?meetID=" + code;
      } else {
        const title = "Invalid Code";
        const body = "Please enter a valid 6-digit code";
        showModal(title, body);
      }
    } else {
      codeElement.focus();
      codeElement.css("border", "2px solid var(--danger");
    }
  });

  $("#signin-btn").click(function () {
    window.location.href = "/auth";
  });
  
  // AUTH PAGE ELEMENTS
  const signinTab = $("#signin-tab");
  const signupTab = $("#signup-tab");
  const signInContent = $("#signin-tab-content");
  const signUpContent = $("#signup-tab-content");

  signinTab.click(function () {
    signinTab.addClass("active");
    signupTab.removeClass("active");
    signUpContent.hide();
    signInContent.show();
  });

  signupTab.click(function () {
    signinTab.removeClass("active");
    signupTab.addClass("active");
    signInContent.hide();
    signUpContent.show();
  });

  // HANDLE AUTH FORM SUBMISSION
  $("#signup-form, #signin-form").on("submit", function (event) {
    event.preventDefault();
    const formId = $(this).attr("id");
    const apiEndPoint =
      formId === "signup-form" ? "/auth/signup" : "/auth/signin";

    const formData = Object.fromEntries(new FormData(this));
    $.ajax({
      url: apiEndPoint,
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify(formData),
      success: function (res) {
        localStorage.setItem("user", JSON.stringify(res.user));
        USER = localStorage.getItem("user");
        ISLOGGED = true;
        console.log(`Returned user data= ${USER}`);
        window.location.href = "/";
      },
      error: function (xhr) {
        console.error(`Error During Auth = ${xhr.statusText}`);
      },
    });
  });

  $(document).on("click", "#signout-btn", function (e) {
    e.preventDefault();
    localStorage.removeItem("user");
    ISLOGGED = false;
    USER = {};
    window.location.href = "/";
  });

  // ROOMS ELEMENTS
  $(".share-link-btn").on("click", function () {
    navigator.clipboard.writeText(MEETCODE).then(() => {
      const title = "Meeting Link Copied";
      const body = `Meeting Link = ${MEETCODE} has been copied to Clipboard`;
      showModal(title, body);
    });
  });
  $(".leave-call-btn, button#hangup-btn").on("click", function () {
    // disconnect socket and WebRTC connection...
    window.location.href = "/";
  });
  $("#vid-pinned-overlay-profile").text(getUserInitials());
  $("#vid-pinned-overlay-name").text(USER.username);

  // $(".control-btn").on("click", function () {
  //     const btnID = $(this).attr("id");
  //     if (btnID === "hangup-btn" || btnID === "menu-btn" || btnID === "share-link-btn") return;
  //     $(this).toggleClass("active");
  // });

  $("#video-btn").on("click", async function () {
  if (!localStream) {
    // First ever click — start fresh
    localStream = await startLocalStream();
    if (!localStream) return;
    $(this).addClass("active");
    return;
  }

  const videoTrack = localStream.getVideoTracks()[0];

  // VIDEO IS ON -> TURN IT OFF
  if (videoTrack && videoTrack.readyState === "live") {
    videoTrack.stop();
    localStream.removeTrack(videoTrack);            // ✅ FIX: Remove dead track
    $(this).removeClass("active");
    $("#vid-pinned-overlay").fadeIn(200);
    return;
  }

  // VIDEO IS OFF -> RESTART JUST THE VIDEO TRACK
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newVideoTrack = newStream.getVideoTracks()[0];
    localStream.addTrack(newVideoTrack);

    const pinnedVideo = $("#vid-pinned-video")[0];
    pinnedVideo.srcObject = null;                   // ✅ FIX: Force browser to re-read stream
    pinnedVideo.srcObject = localStream;
    pinnedVideo.play();

    $(this).addClass("active");
    $("#vid-pinned-overlay").fadeOut(200);
  } catch (error) {
    showModal("Camera Error", "Could not restart the camera hardware.");
  }
});

  $("#mic-btn").on("click", async function () {
  // First ever mic click — request ONLY audio
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); // ✅ audio only
    } catch (error) {
      showModal("Mic Error", "Could not access microphone.");
      return;
    }
    $(this).addClass("active");
    return;
  }

  let audioTrack = localStream.getAudioTracks()[0];

  // No audio track yet (user started stream via video btn) — add one now
  if (!audioTrack) {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioTrack = audioStream.getAudioTracks()[0];
      localStream.addTrack(audioTrack);             // ✅ FIX: Add mic to existing stream
    } catch (error) {
      showModal("Mic Error", "Could not access microphone.");
      return;
    }
    $(this).addClass("active");
    return;
  }

  // Audio track exists — just toggle it
  audioTrack.enabled = !audioTrack.enabled;
  $(this).toggleClass("active", audioTrack.enabled);
});
  
});
