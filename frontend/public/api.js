const API_BASE = "http://localhost:4000";

function getToken() {
  return localStorage.getItem("methalo_token");
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json"
  };
  if (token) headers["Authorization"] = token;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

window.API = { apiFetch, getToken, API_BASE };