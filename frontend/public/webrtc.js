const videoEl = document.getElementById("browser-video");

let pc = null;
let dataChannel = null;

async function startWebRTC(sessionId) {
  pc = new RTCPeerConnection();

  pc.ontrack = (event) => {
    videoEl.srcObject = event.streams[0];
  };

  pc.ondatachannel = (event) => {
    dataChannel = event.channel;
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      fetch("/api/webrtc/candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, candidate: event.candidate })
      });
    }
  };

  const offerRes = await fetch("/api/webrtc/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });

  const { offer } = await offerRes.json();

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await fetch("/api/webrtc/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, answer })
  });
}

function sendInput(msg) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(msg));
  }
}

window.WebRTCClient = { startWebRTC, sendInput, videoEl };