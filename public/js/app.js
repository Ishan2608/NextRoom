$(document).ready(function () {
  // GLOBAL VARIABLES
  let MEETCODE = 0;

  // HOME PAGE ELEMENTS
  const signinBtn = $("#signin-btn");

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
