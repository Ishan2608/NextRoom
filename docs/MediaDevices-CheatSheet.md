# MediaDevices API — Cheat Sheet
### navigator.mediaDevices · MediaStream · MediaStreamTrack

---

## 01. Object Hierarchy

Everything lives in a chain. You request access from the browser, get back a Stream, and read or manipulate its Tracks.

```
navigator.mediaDevices
    └── .getUserMedia({ video, audio })       async call — returns a MediaStream
            └── MediaStream                   stored in your localStream variable
                    ├── VideoTrack            MediaStreamTrack, kind: "video"
                    └── AudioTrack            MediaStreamTrack, kind: "audio"
```

A `MediaStream` is a container. It holds tracks. Each track represents one physical hardware source. The stream itself does not do anything — it is just the box that holds the data pipelines.

---

## 02. getUserMedia — Requesting Hardware Access

```javascript
// Request BOTH camera and microphone
await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

// Request ONLY camera
await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

// Request ONLY microphone
await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
```

Each call returns a brand new `MediaStream`. This is important: when restarting a single track, you extract only the track you need from the new stream — you do not replace the entire `localStream`.

---

## 03. MediaStream — Methods Reference

All of these are called on your `localStream` variable.

| Method | Arguments | Returns | Description |
|---|---|---|---|
| `.getVideoTracks()` | none | `Array<MediaStreamTrack>` | All video tracks currently in the stream |
| `.getAudioTracks()` | none | `Array<MediaStreamTrack>` | All audio tracks currently in the stream |
| `.getTracks()` | none | `Array<MediaStreamTrack>` | All tracks regardless of kind |
| `.addTrack(track)` | `track` — a `MediaStreamTrack` | `void` | Inserts a new track into the stream |
| `.removeTrack(track)` | `track` — a `MediaStreamTrack` | `void` | Removes a specific track from the stream |

A single track is accessed via index: `localStream.getVideoTracks()[0]`

---

## 04. MediaStreamTrack — Properties and Methods Reference

These are called on the individual track object, not on the stream.

| Name | Kind | Values | Description |
|---|---|---|---|
| `.kind` | Property | `"video"` or `"audio"` | Identifies what type of track this is |
| `.readyState` | Property | `"live"` or `"ended"` | `"ended"` means the hardware has been killed and the track is permanently dead |
| `.enabled` | Property | `true` or `false` | Soft switch. Blocks data flow but hardware stays on. Can be reversed at any time |
| `.stop()` | Method — no arguments | `void` | Kills hardware permanently. LED turns off. Sets `readyState` to `"ended"`. Cannot be undone |

---

## 05. The Critical Distinction — `.enabled` vs `.stop()`

This is the most important concept when building media controls.

| Behaviour | `.enabled = false` | `.stop()` |
|---|---|---|
| Camera LED | Still ON | Turns OFF |
| Data flowing | No | No |
| Track recoverable | Yes — flip `.enabled = true` | No — must create a brand new track |
| Hardware released | No | Yes |
| Appropriate use case | Temporary mute or pause | User explicitly turns off camera |

> Use `.enabled` when you want a soft mute that can be reversed instantly.
> Use `.stop()` only when the user intends to fully release the hardware.

---

## 06. The Video Element — Connecting the Stream to the UI

```javascript
const videoEl = document.getElementById("my-video");

videoEl.srcObject = localStream;   // point the video element at your stream
videoEl.play();                    // begin rendering frames on screen
```

When you add a new track to an existing stream, the video element does not automatically detect it. You must force a refresh by resetting `srcObject`:

```javascript
videoEl.srcObject = null;       // clear the old reference
videoEl.srcObject = localStream; // reassign — browser re-reads all tracks
videoEl.play();
```

---

## 07. State Reference — What localStream Looks Like

`localStream` starts as `null` on every page load. Its contents change as the user interacts with the controls.

| Scenario | localStream | Video Track state | Audio Track state |
|---|---|---|---|
| Page just loaded | `null` | absent | absent |
| Video ON, Audio OFF | MediaStream | `readyState: "live"` | absent |
| Audio ON, Video OFF | MediaStream | absent | `enabled: true` |
| Both ON | MediaStream | `readyState: "live"` | `enabled: true` |
| Video turned off (hardware killed) | MediaStream | removed from stream | unchanged |
| Audio muted (soft) | MediaStream | unchanged | `enabled: false` |

---

## 08. The Four Control Functions — Complete Code

Video and Audio are fully symmetric. Both follow the same pattern: `enable` starts hardware and adds a fresh track, `disable` kills hardware and removes the dead track.

### enableVideo()
Called when the video button is clicked and no live video track exists.

```javascript
async function enableVideo() {
    try {
        // Request ONLY video from the browser.
        // This returns a brand new MediaStream — store it in a temp variable.
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

        // Extract only the video track from that temporary stream.
        const newVideoTrack = tempStream.getVideoTracks()[0];

        if (localStream) {
            // A stream already exists (e.g., audio was started first).
            // Do NOT replace localStream. Just insert the new video track into it.
            localStream.addTrack(newVideoTrack);
        } else {
            // No stream exists at all. This is the very first media action.
            // It is safe to assign the temporary stream directly as localStream.
            localStream = tempStream;
        }

        // Point the video element at localStream and force a browser refresh.
        const videoEl = document.getElementById("my-video");
        videoEl.srcObject = null;
        videoEl.srcObject = localStream;
        videoEl.play();

        // Update UI — mark the video button as active.
        document.getElementById("video-btn").classList.add("active");

    } catch (error) {
        console.error("enableVideo failed:", error);
    }
}
```

### disableVideo()
Called when the video button is clicked and a live video track exists.

```javascript
function disableVideo() {
    // Guard: if no stream exists, there is nothing to stop.
    if (!localStream) return;

    // Get the current video track.
    const videoTrack = localStream.getVideoTracks()[0];

    // Guard: if no video track, or it is already dead, there is nothing to stop.
    if (!videoTrack || videoTrack.readyState !== "live") return;

    // Kill the hardware. This turns off the camera LED.
    // After this line, videoTrack.readyState becomes "ended".
    videoTrack.stop();

    // Remove the dead track from the stream.
    // A stopped track is permanently dead — keeping it in the stream causes problems.
    localStream.removeTrack(videoTrack);

    // Update UI — mark the video button as inactive.
    document.getElementById("video-btn").classList.remove("active");
}
```

### enableAudio()
Called when the mic button is clicked and no audio track exists in the stream yet.

```javascript
async function enableAudio() {
    try {
        // Request ONLY audio from the browser.
        // video: false ensures the camera is not touched.
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });

        // Extract only the audio track.
        // A freshly created track from getUserMedia is always enabled by default.
        // Setting .enabled = true here is redundant and unnecessary.
        const newAudioTrack = tempStream.getAudioTracks()[0];

        if (localStream) {
            // A stream already exists (e.g., video was started first).
            // Insert the audio track into the existing stream.
            localStream.addTrack(newAudioTrack);
        } else {
            // No stream exists at all. Assign the temporary stream as localStream.
            localStream = tempStream;
        }

        // Update UI — mark the mic button as active.
        document.getElementById("mic-btn").classList.add("active");

    } catch (error) {
        console.error("enableAudio failed:", error);
    }
}
```

### disableAudio()
Called when the mic button is clicked and a live audio track exists. Mirrors disableVideo exactly.

```javascript
function disableAudio() {
    // Guard: if no stream exists, there is nothing to stop.
    if (!localStream) return;

    // Get the current audio track.
    const audioTrack = localStream.getAudioTracks()[0];

    // Guard: if no audio track, or it is already dead, there is nothing to stop.
    if (!audioTrack || audioTrack.readyState !== "live") return;

    // Kill the hardware. Microphone LED or indicator turns off.
    // After this line, audioTrack.readyState becomes "ended".
    audioTrack.stop();

    // Remove the dead track from the stream.
    // A stopped track is permanently dead — keeping it in the stream causes problems.
    localStream.removeTrack(audioTrack);

    // Update UI — mark the mic button as inactive.
    document.getElementById("mic-btn").classList.remove("active");
}
```

---

## 09. Button Click Decision Logic

Your click handlers stay clean because all logic lives in the four functions above. Both buttons follow the exact same pattern.

```javascript
document.getElementById("video-btn").addEventListener("click", function () {
    if (!localStream) {
        // No stream at all — start video for the first time.
        enableVideo();
        return;
    }

    const videoTrack = localStream.getVideoTracks()[0];

    if (videoTrack && videoTrack.readyState === "live") {
        // A live video track exists — the user wants to turn it off.
        disableVideo();
    } else {
        // Stream exists but has no live video track — the user wants to turn it on.
        enableVideo();
    }
});

document.getElementById("mic-btn").addEventListener("click", function () {
    if (!localStream) {
        // No stream at all — start audio for the first time.
        enableAudio();
        return;
    }

    const audioTrack = localStream.getAudioTracks()[0];

    if (audioTrack && audioTrack.readyState === "live") {
        // A live audio track exists — the user wants to turn it off.
        disableAudio();
    } else {
        // Stream exists but has no live audio track — the user wants to turn it on.
        enableAudio();
    }
});
```

---

## 10. Sample HTML Structure

No CSS is included. Class names match those referenced in the functions above.

```html
<!-- Video display area -->
<div id="video-container">
    <video id="my-video" autoplay playsinline muted></video>
    <div id="video-overlay">
        <span id="user-initials"></span>
        <span id="user-name"></span>
    </div>
</div>

<!-- Media control buttons -->
<div id="controls">
    <button id="video-btn" type="button">Camera</button>
    <button id="mic-btn" type="button">Microphone</button>
</div>
```

> The `muted` attribute on the `video` tag is intentional. It prevents the user from hearing their own microphone echo through the speakers locally. The audio track is still active and will be transmitted to other participants through WebRTC — it just is not played back on the local machine.

> `playsinline` is required on mobile browsers (especially iOS Safari) to prevent the video from jumping into fullscreen automatically when it starts playing.
