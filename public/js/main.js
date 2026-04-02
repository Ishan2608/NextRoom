/*
    - Each time any page is loaded, entire JS file is re-run.
    - Thus, maintaing global variable for cross page reference is not possible.
    - Use window object to store such values using window.<name_of_variable>.
    - Here, convention used is window.__<VARIABLE_NAME>
    - First code to execute - syncState to synchronize authentication  across pages.
*/

import {
    showModal, getUserInitials, 
    generateMeetCode, validateCode, getURLParameter,
    showParticipantsModal
} from './utils.js';

import {
    userMap, pcMap, joinRoom, handleUserLeft, sendMessage,
    camStream, audioTrack, videoTrack, screenStream, screenTrack
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
    } else {
        window.__USER = null;
        window.__ISLOGGED = false;
        window.__USER_INITS = null;
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
            $("#profile-pic").hide();
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
            if (!window.__ISLOGGED){
                let title = "Unauthorized Acces";
                let msg = "Please login to be able to join a meeting";
                return showModal(title, msg);
            }
            const codeInput = $("#code-input");
            const code = codeInput.val();
            if (code === ""){
                codeInput.focus();
                codeInput.css("border", "2px solid var(--danger");
            } else {
                const valid = validateCode(code);
                if (!valid){
                    let title = "Invalid Code";
                    let msg = "Enter a valid 6 digit Code";
                    showModal(msg);
                } else {
                    window.location.href = `/room?meetID=${code}`;
                }
            }
        });

        $("#signin-btn").on("click", ()=>{
            window.location.href = "/auth";
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
        
        window.__MEETCODE = getURLParameter("meetID");
        console.log(window.__MEETCODE);
        $("#profile-pic").text(window.__USER_INITS);
        $("#nav-meet-code").text(window.__MEETCODE);
        $("#vid-pinned-overlay-profile").text(window.__USER_INITS);
        $("#vid-pinned-overlay-name").text(window.__USER.username);
        // Create WebRTC Connection.
        joinRoom();
        

        // When User Clicks on Share Link Button.
        $(".share-link-btn").on("click", function () {
            navigator.clipboard.writeText(window.__MEETCODE).then(() => {
                const title = "Meeting Link Copied";
                const body = `Meeting Link = ${window.__MEETCODE} has been copied to Clipboard`;
                showModal(title, body);
            });
        });
        
        $(".leave-call-btn, button#hangup-btn").on("click", ()=>{
            handleUserLeft();
            window.location.href = "/";
        });

        $("#send-chat-msg-btn").on("click", ()=> {
            const inputElement = $("#chat-msg");
            const msg = inputElement.val();
            if (msg.trim() === "") inputElement.focus();
            else {
                sendMessage(msg.trim());
                inputElement.val("");
            }
        });

        $("#chat-msg").on("keydown", (event)=>{
            const inputElement = $("#chat-msg");
            if(event.key === "Enter"){
                const msg = inputElement.val().trim();
                if (msg === "") inputElement.focus();
                else {
                    sendMessage(msg.trim());
                    inputElement.val("");
                }
            }
        });

        $("#mic-btn").on("click", function (){
            $("#mic-btn").toggleClass('active');
            // toggleAudio(audioTrack, pcMap);
        });
        $("#video-btn").on("click", function (){
            $("#video-btn").toggleClass('active');
            // toggleVideo(videoTrack, pcMap);
        });
        $("#screen-btn").on("click", function (){
            $("#screen-btn").toggleClass('active');
            // toggleScreen(screenTrack, pcMap);
        });
        
        $("#menu-btn").on("click", ()=>{
            showParticipantsModal(userMap);
        });

        $(".participants-modal-overlay, #close-participants-modal").on("click", function(){
            $(".participants-modal-overlay").fadeOut();
            $(".participants-modal").fadeOut();
        });

    } 
    // --------------------------------------------------------------------------
    // AUTH PAGE
    // --------------------------------------------------------------------------
    else if (path.includes('/auth')){
        // On Authentication Page.
        // If already logged in, not allowed on auth page, send back to home.
        if (window.__ISLOGGED) return window.location.href="/";
        // Select Tab Buttons and their Contents.
        const signinTab = $("#signin-tab");
        const signInContent = $("#signin-tab-content");
        
        const signupTab = $("#signup-tab");
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
                        window.__USER = res.user;
                        window.__ISLOGGED = true;

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
        
    }
    
    else if (path.includes("/health")){
        // API Check.
        window.location.href = "/";
        return;
    }
    
    else {
        // 404 Error. Re-direct to Home.
        window.location.href = "/";
        return;
    }

    // When user closes tab, call handleUserLeft() to clear connections.
    $(window).on("beforeunload", function() {
        handleUserLeft();
    });
}); // <-- DOM Ready

