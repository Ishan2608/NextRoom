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
} from './utils.js';

import {
    userMap, joinRoom
} from './rtc.js';

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

        // If user is logged in,
        if (window.__ISLOGGED){
            // Convert Sign In to Sign Out.
            $("#signin-btn").text("Sign Out").attr("href", "#").attr("id", "signout-btn");
            // Set Profile Picture.
            $("#profile-pic").text(window.__USER_INITS);
        } else {
            // Convert Sign Out to Sign In.
            $("#signout-btn").text("Sign In").attr("href", "/auth").attr("id", "signin-btn");
        }

        // REGISTER EVENT LISTENERS
        $(".new-meet-btn").on("click", ()=>{
            if (!window.__ISLOGGED){
                title = "Unauthorized Action";
                message = "Please Sign In or Sign Up to be able to attend a meeting.";
                showModal(title, message);
            } else {
                const meetCode = generateMeetCode();
                window.location.href = `/room?meetID=${meetCode}`;
            }
        });

        $("#join-btn").on("click", ()=>{
            const codeInput = $("#code-input");
            const code = codeInput.val();
            if (code === ""){
                codeInput.focus();
                codeInput.css("border", "2px solid var(--danger");
            }
            const valid = validateCode(code);
            if (!valid){
                title = "Invalid Code";
                msg = "Enter a valid 6 digit Code";
                showModal(msg);
            } else {
                window.location.href = `/room?meetID=${code}`;
            }
        });

        $("#signout-btn").on("click", ()=>{
            localStorage.clear();
            window.__USER = {};
            window.__USER_INITS = "";
            window.__ISLOGGED = false;
            window.__MEETCODE = 0;
            window.location.href = "/";
        });
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
            
            // Create WebRTC Connection.
            joinRoom();
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

