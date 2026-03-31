import {
    showModal, getUserInitials, 
    generateMeetCode, validateCode, getURLParameter
} from './utils.js'

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

$(document).ready(function (){
    syncState();

    // Get pathname to know which page is loaded.
    const path = window.location.pathname;
    if (path === "/") {
        // On Home Page.
    }
    else if (path.includes('/room')){
        // On Room Page
    } 
    else if (path.includes('/auth')){
        // On Authentication Page.
    }
    else if (path.includes("/health")){
        // API Check.
    }
    else {
        // 404 Error.
    }
}); // <-- DOM Ready

