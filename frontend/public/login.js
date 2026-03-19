const form = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("login-error");
const button = document.getElementById("login-button");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  button.disabled = true;

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    localStorage.setItem("methalo_token", data.token);
    localStorage.setItem("methalo_session_id", data.sessionId);

    window.location.href = "/browser";
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Incorrect username or password.";
  } finally {
    button.disabled = false;
  }
});