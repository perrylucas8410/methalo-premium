function setupCleanup(sessions) {
  setInterval(() => {
    // TODO: add TTL / lastActive logic
    // For now, do nothing
  }, 60_000);
}

module.exports = { setupCleanup };