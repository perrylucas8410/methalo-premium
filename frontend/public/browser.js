const { apiFetch: apiRequest, getToken } = window.API;
const { startWebRTC, sendInput, videoEl } = window.WebRTCClient;

const tabsContainer = document.getElementById("tabs");
const newTabBtn = document.getElementById("new-tab-btn");
const signoutBtn = document.getElementById("signout-btn");

let tabs = [];
let activeTab = null;

const token = getToken();
if (!token) {
  window.location.href = "/";
}

async function init() {
  try {
    const attach = await apiRequest("/api/session/attach", {
      method: "GET"
    });

    const sessionId = attach.sessionId;

    await startWebRTC(sessionId);
    await loadTabs();

    setupInput();
  } catch (err) {
    console.error("Init failed:", err);
    window.location.href = "/";
  }
}

async function loadTabs() {
  const data = await apiRequest("/api/session/tabs", { method: "GET" });
  tabs = data.tabs || [];
  activeTab = data.activeTab || tabs[0] || null;
  renderTabs();
}

newTabBtn.onclick = async () => {
  const data = await apiRequest("/api/session/tab/create", {
    method: "POST",
    body: JSON.stringify({})
  });
  const tabId = data.tabId;
  if (!tabs.includes(tabId)) tabs.push(tabId);
  activeTab = tabId;
  renderTabs();
};

async function switchTab(tabId) {
  if (tabId === activeTab) return;
  await apiRequest("/api/session/tab/switch", {
    method: "POST",
    body: JSON.stringify({ tabId })
  });
  activeTab = tabId;
  renderTabs();
}

async function closeTab(tabId) {
  await apiRequest("/api/session/tab/close", {
    method: "POST",
    body: JSON.stringify({ tabId })
  });
  tabs = tabs.filter(t => t !== tabId);
  if (activeTab === tabId) {
    activeTab = tabs[0] || null;
  }
  renderTabs();
}

function renderTabs() {
  tabsContainer.innerHTML = "";
  tabs.forEach(tabId => {
    const tab = document.createElement("div");
    tab.className = "tab" + (tabId === activeTab ? " active" : "");

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = `Tab ${tabId.slice(-4)}`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "×";

    tab.onclick = () => switchTab(tabId);
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tabId);
    };

    tab.appendChild(title);
    tab.appendChild(closeBtn);
    tabsContainer.appendChild(tab);
  });
}

function setupInput() {
  videoEl.addEventListener("mousemove", (e) => {
    const rect = videoEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sendInput({ type: "mouseMove", x, y });
  });

  videoEl.addEventListener("mousedown", (e) => {
    const rect = videoEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sendInput({ type: "mouseDown", x, y, button: e.button });
  });

  videoEl.addEventListener("mouseup", (e) => {
    const rect = videoEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    sendInput({ type: "mouseUp", x, y, button: e.button });
  });

  videoEl.addEventListener("wheel", (e) => {
    sendInput({
      type: "mouseWheel",
      deltaX: e.deltaX,
      deltaY: e.deltaY
    });
  });

  window.addEventListener("keydown", (e) => {
    sendInput({ type: "keyDown", key: e.key });
  });

  window.addEventListener("keyup", (e) => {
    sendInput({ type: "keyUp", key: e.key });
  });
}

signoutBtn.onclick = async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: token }
    });
  } catch (e) {
    console.error(e);
  }
  localStorage.removeItem("methalo_token");
  localStorage.removeItem("methalo_session_id");
  window.location.href = "/";
};

init();