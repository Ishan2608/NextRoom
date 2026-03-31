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
    userMap, joinRoom, handleUserLeft
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

function showParticipantsModal() {
    const users = userMap.values();
    const list = document.getElementById("participants-list");
    
    // Clear previous content so stale rows don't appear if modal is reopened
    list.innerHTML = "";

    users.forEach((user) => {
        const isMe = user.id === USER.id;
        const initials = getUserInitials(user.username);
        let allRows = ``;
        const row = `
            <div style="display:flex; align-items:center; gap:12px;
                        padding:10px 12px; border-radius:8px;
                        background:rgba(255,255,255,0.05);">

                <div style="width:40px; height:40px; border-radius:50%;
                            background:#6c63ff; flex-shrink:0;
                            display:flex; align-items:center; justify-content:center;
                            font-size:14px; font-weight:600; color:#fff;">
                    ${initials}
                </div>

                <div style="overflow:hidden;">
                    <div style="font-size:14px; font-weight:500; white-space:nowrap;
                                overflow:hidden; text-overflow:ellipsis;">
                        ${user.username}
                        ${isMe ? '<span style="font-size:11px; opacity:0.5; margin-left:4px;">(you)</span>' : ''}
                    </div>
                    <div style="font-size:12px; opacity:0.55; white-space:nowrap;
                                overflow:hidden; text-overflow:ellipsis;">
                        ${user.email}
                    </div>
                </div>
            </div>
        `;
        allRows += row;
    });
    list.innerHTML = allRows;
    // Show participant count in the title
    document.getElementById("participants-modal-title").textContent = `In this call (${usersMap.size})`;

    $(".participants-modal").show();
    $(".participants-modal-overlay").show();
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

        // When User Clicks on Share Link Button.
        $(".share-link-btn").on("click", function () {
            navigator.clipboard.writeText(window.__MEETCODE).then(() => {
                const title = "Meeting Link Copied";
                const body = `Meeting Link = <strong>${window.__MEETCODE}</strong> has been copied to Clipboard`;
                showModal(title, body);
            });
        });
        
        $(".leave-call-btn, button#hangup-btn", ()=>{
            window.__MEETCODE = 0;
            if(window.__LOCALSTREAM){
                window.__LOCALSTREAM.getTracks().forEach(track => track.stop());
                window.__LOCALSTREAM = null;
                window.__MEETCODE = 0;
                handleUserLeft();
                window.location.href = "/";
            }
        });

        $("#mic-btn").on("click", ()=>{});
        $("#video-btn").on("click", ()=>{});
        $("#screen-btn").on("click", ()=>{});
        $("#menu-btn").on("click", ()=>{});

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
                    USER = res.user;
                    ISLOGGED = true;

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

