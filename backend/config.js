/**
 * Configuration File for Browser Platform
 * 
 * Add or modify users and browser sessions here.
 * Restart the server after making changes.
 */

module.exports = {
  // =====================================================
  // USER ACCOUNTS
  // =====================================================
  // Add users in the format: { username: 'name', password: 'pass', isAdmin: true/false }
  // Passwords are automatically hashed on server startup
  // isAdmin: true gives access to the admin panel instead of browser session
  
  users: [
    { username: 'admin', password: 'admin123', isAdmin: true },    // Admin account - opens admin panel
    { username: 'user1', password: 'password1', isAdmin: false },  // Regular user - opens browser
    { username: 'user2', password: 'password2', isAdmin: false },
    { username: 'user3', password: 'password3', isAdmin: false },
    { username: 'user4', password: 'password4', isAdmin: false },
    { username: 'user5', password: 'password5', isAdmin: false }
  ],

  // =====================================================
  // BROWSER SESSIONS
  // =====================================================
  // Number of shared Chromium browser sessions to create
  // Each session can be shared by multiple users
  // More sessions = more concurrent users but more RAM usage
  // 
  // RAM Usage Estimate:
  // - Each Chromium session uses ~150-300MB RAM
  // - 5 sessions = ~750MB - 1.5GB
  // - 10 sessions = ~1.5GB - 3GB
  
  numBrowserSessions: 5,

  // =====================================================
  // HEARTBEAT SETTINGS
  // =====================================================
  // Time (in milliseconds) before a user session is released
  // if no heartbeat is received
  // Default: 5000ms (5 seconds)
  
  heartbeatTimeout: 5000,

  // =====================================================
  // HOW TO ADD MORE USERS
  // =====================================================
  // 1. Add a new entry to the 'users' array above:
  //    { username: 'newuser', password: 'newpassword', isAdmin: false }
  //
  // 2. Save this file
  //
  // 3. Restart the backend server
  //
  // =====================================================
  // HOW TO ADD MORE BROWSER SESSIONS
  // =====================================================
  // 1. Change 'numBrowserSessions' to your desired number
  //
  // 2. Save this file
  //
  // 3. Restart the backend server
  //
  // Note: Each additional session uses more RAM
  //
  // =====================================================
  // HOW TO CREATE AN ADMIN ACCOUNT
  // =====================================================
  // 1. Add a new entry with isAdmin: true:
  //    { username: 'myadmin', password: 'securepass', isAdmin: true }
  //
  // 2. Save this file
  //
  // 3. Restart the backend server
  //
  // Admin accounts open the admin panel instead of a browser session
};
