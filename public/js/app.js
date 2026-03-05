// GLOBAL VARIABLES
var MEETCODE = 0;
var USER = {};
var ISLOGGED = false;

$(document).ready(function () {
  // If user is not logged in, redirect them to home
  // if (window.location.href === "http://localhost:3000/room.html") {
  //   if (!ISLOGGED) {
  //     window.location.href = "index.html";
  //   }
  // }

  // HOME PAGE ELEMENTS
  const signinBtn = $("#signin-btn");
  const profilePic = $("#user-initials");

  // Get GLOBAL ELEMENTS - MODAL and MODAL OVERLAY
  const modalOverlay = $(".modal-overlay");
  const modal = $(".modal");
  const modalTitle = $(".modal-title");
  const modalContent = $(".modal-content");

  modalOverlay.click(function () {
    modalOverlay.hide();
    modal.hide();
  });

  // ROOM PAGE ELEMENTS
  const navMeetCode = $("#nav-meet-code");
  if (window.location.href.includes("meetID")) {
    navMeetCode.text(MEETCODE);
  }

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
  function getUser() {
    return JSON.parse(localStorage.getItem("user")) || USER;
  }

  function signOut() {
    localStorage.clear();
  }

  function getUserInitials() {
    const username = getUser().username;
    if (!username) return "U";
    const names = username.trim().split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
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

  // METHODS FOR HOME PAGE
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

  $("#signin-btn").click(function () {
    window.location.href = "auth.html";
  });

  $(".new-meet-btn").click(function () {
    MEETCODE = Math.floor(Math.random() * 1000000 + 1);
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
