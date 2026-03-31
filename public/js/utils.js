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

