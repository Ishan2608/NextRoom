// GLOBAL VARIABLES
var MEETCODE = 0;
var USER = {};
var ISLOGGED = false;

// 1. Define Utilities in Global Scope
function showModal(title, message) {
  const modal = $(".modal");
  const modalOverlay = $(".modal-overlay");

  $(".modal-title").text(title);
  $(".modal-content").text(message);

  modal.show();
  modalOverlay.show();
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

function getUrlParameter(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function getURLParameter(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

$(document).ready(function () {
  // 1. Get user details on each page load.
  const storedUser = JSON.parse(localStorage.getItem("user"));
  if (storedUser) {
    USER = storedUser;
    ISLOGGED = true;
  }

  // 2. Define function to set some global UI elements.
  function syncAuthState() {
    const signinBtn = $("#signin-btn");
    const profilePic = $("#profile-pic");

    if (ISLOGGED) {
      signinBtn.text("Sign Out").attr("href", "#").attr("id", "signout-btn");
      profilePic.text(getUserInitials()).show();

      if (window.location.pathname.includes("room.html")) {
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
      if (window.location.pathname.includes("room.html")) {
        window.location.href = "index.html";
      }
    }
  }

  // 3. Sync state for page when it reloads as the first thing.
  syncAuthState();

  // 4. SIGN OUT LOGIC
  $(document).on("click", "#signout-btn", function (e) {
    e.preventDefault();
    localStorage.removeItem("user");
    ISLOGGED = false;
    USER = {};
    window.location.href = "index.html";
  });

  // Get GLOBAL ELEMENTS - MODAL and MODAL OVERLAY
  const modalOverlay = $(".modal-overlay");

  modalOverlay.click(function () {
    modalOverlay.hide();
    modal.hide();
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
  // METHODS FOR AUTH PAGE

  function getUserInitials() {
    const name = USER.username || "User";
    const parts = name.trim().split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

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
        window.location.href = "index.html";
      },
      error: function (xhr) {
        console.error(`Error During Auth = ${xhr.statusText}`);
      },
    });
  });

  $("#signin-btn").click(function () {
    window.location.href = "auth.html";
  });

  $(".new-meet-btn").click(function () {
    if (!ISLOGGED) {
      return;
    }
    // Generates a random number between 100,000 and 999,999
    const min = 100000;
    const max = 999999;
    MEETCODE = Math.floor(Math.random() * (max - min + 1)) + min;
    window.location.href = "room.html?meetID=" + MEETCODE;
  });

  $("#join-btn").click(function () {
    const codeElement = $("#code-input");
    const code = codeElement.val();
    if (code) {
      const verified = validateCode(code);
      if (verified) {
        window.location.href = "room.html?meetID=" + code;
        navMeetCode.text(MEETCODE);
      } else {
        modalOverlay.show();
        modal.show();
        modalTitle.text("Invalid Code");
        modalContent.text("Please enter a valid 6-digit code");
      }
    } else {
      codeElement.focus();
      codeElement.css("border", "2px solid var(--danger");
    }
  });
});
