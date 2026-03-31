/*
    - Each time any page is loaded, entire JS file is re-run.
    - Thus, maintaing global variable for cross page reference is not possible.
    - Use window object to store such values using window.<name_of_variable>.
    - Here, convention used is window.__<VARIABLE_NAME>
    - First code to execute - syncState to synchronize authentication  across pages.
*/

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
    // --------------------------------------------------------------------------
    // HOME PAGE
    // --------------------------------------------------------------------------
    if (path === "/") { 
        // On Home Page.
        if (window.__ISLOGGED){
            $("#signin-btn").text("Sign Out").attr("href", "#").attr("id", "signout-btn");
            $("#profile-pic").text(window.__USER_INITS);
        } else {
            $("#signout-btn").text("Sign In").attr("href", "/auth").attr("id", "signin-btn");
        }

        
    }

    // --------------------------------------------------------------------------
    // ROOM PAGE
    // --------------------------------------------------------------------------
    else if (path.includes('/room')){
        // On Room Page
        
        // If not logged in, not allowed on rooms page, send back to home.
        if (!window.__ISLOGGED) return window.location.href="/";
        else {
            window.__MEETCODE = getURLParameter("meetID");
            $("#profile-pic").text(window.__USER_INITS);
            $("#nav-meet-code").text(window.__MEETCODE);
        }
    } 
    // --------------------------------------------------------------------------
    // AUTH PAGE
    // --------------------------------------------------------------------------
    else if (path.includes('/auth')){
        // On Authentication Page.
        // If already logged in, not allowed on auth page, send back to home.
        if (window.__ISLOGGED) return window.location.href="/";
    }
    
    else if (path.includes("/health")){
        // API Check.
    }
    
    else {
        // 404 Error. Re-direct to Home.
        window.location.href = "/";
        return;
    }
}); // <-- DOM Ready

