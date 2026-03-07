/*
Each time user opens a different page, the whole JS re-loaded, thus, this file executeds 
from 1st line to last, re-initializing the global variables. To maintain state:
- We store important values in localStorage, which is unaffected by page reloads, thus data persists.
- We create a method, that is run automatically on each page load, setting global variable values.
*/

// GLOBAL VARIABLES
var USER = {};
var ISLOGGED = false;
var MEETCODE = 0;
let localStream = null;

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
            localStream.addTrack(videoTrack); // FIX: was addTrack() with no argument
        } else {
            localStream = tempStream;
        }

        // 4. Point the video element at localStream.
        //    srcObject must be set to null first to force the browser to re-read the stream.
        //    Without this, the browser may not detect the newly added track.
        const videoElement = document.getElementById("vid-pinned-video");
        videoElement.srcObject = null; // FIX: was missing — browser needs this nudge
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

    // 5. Show the overlay and mark the video button as inactive.
    $("#vid-pinned-overlay").fadeIn(); // FIX: was $("vid-pinned-overlay") — missing #
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
    //    FIX: was readyState === "live" which is inverted — that would return early
    //    when the track IS live, which is the opposite of what we want.
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

    // 5. Mark the mic button as inactive.
    $("#mic-btn").removeClass("active");
}


// When Page is Loaded and JS is ready to run.
$(document).ready(function () {
  
  // First, sync state, regardless of Page.
  syncState();

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
    Just Redirect to auth.html Page.
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
          // console.log(`Returned user data= ${USER}`);

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

  // When User Clicks on Share Link Button.
  $(".share-link-btn").on("click", function () {
    // Since we are on room.html, syncState already set MEETCODE.
    // Just Write that to ClipBoard.
    navigator.clipboard.writeText(MEETCODE).then(() => {
      const title = "Meeting Link Copied";
      const body = `Meeting Link = ${MEETCODE} has been copied to Clipboard`;
      // Show the Message through Modal.
      showModal(title, body);
    });
  });

  // There are two Leav Call Buttons. When User clicks on either of them,
  $(".leave-call-btn, button#hangup-btn").on("click", function () {
    // disconnect socket and WebRTC connection...
    
    // Stop all active tracks before leaving to release hardware.
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    // Reset MEETCODE  and redirec to Home.
    MEETCODE = 0;
    window.location.href = "/";
  });

  // Initiate Pinned User Display Elements.
  $("#vid-pinned-overlay-profile").text(getUserInitials(USER.username));
  $("#vid-pinned-overlay-name").text(USER.username);

  $("#video-btn").on("click", async function() {
    // If no stream exists at all, this is the first time — enable video.
    if (!localStream) {
      await enableVideo();
      return;
    }

    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === "live") {
      // A live video track exists — user wants to turn camera off.
      disableVideo();
    } else {
      // Stream exists but has no live video track — user wants to turn camera on.
      await enableVideo();
    }
  });

  // ================ MIC BUTTON ================
  $("#mic-btn").on("click", async function () {
    // If no stream exists at all, this is the first time — enable audio.
    if (!localStream) {
      await enableAudio();
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];

    if (audioTrack && audioTrack.readyState === "live") {
      // A live audio track exists — user wants to turn mic off.
      disableAudio();
    } else {
      // Stream exists but has no live audio track — user wants to turn mic on.
      await enableAudio();
    }
  });
  
});
