const MINT_ADDRESS = "k9uz5aSAFQAb2wMLuP2MU73FnwJRMThcsfmmr5KbQ3E";
const CREATOR_WALLET = "24CbJMAacduVCbxqKroXPUGed8dHUBPWYGuySDh7fmWn";
const scriptUrl = "https://script.google.com/macros/s/AKfycbwpF_qLZypzzhsCgdqXSMvmN6_OwFMsgnG8THtyjtCvo57dwjaDxkN3ZhKxJRtow-1nbQ/exec";

// Secure SHA-256 hash of password "Pktvk13"
const ADMIN_HASH = "a3485f3e2aab41391aeda05cd3d5dce743079927ab4d9bd2f87b179b75ccd9f2";

let userWalletAddress = null;
let referrerAddress = null;
let adminPassword = null; // Stored temporarily in-session when unlocked to verify DB queries

// Helper to get device-specific Phantom download link
function getPhantomDownloadUrl() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/android/i.test(ua)) {
    return "https://play.google.com/store/apps/details?id=app.phantom"; // Android Play Store
  }
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    return "https://apps.apple.com/app/phantom-solana-wallet/id1598432977"; // iOS App Store
  }
  return "https://phantom.app/download"; // Desktop browser extension
}

window.addEventListener("load", () => {
  // Detect Referrer parameter in URL (?ref=WALLET_ADDRESS)
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get("ref");
  
  if (ref && validateSolanaAddress(ref)) {
    referrerAddress = ref;
    localStorage.setItem("tvk_referrer", ref);
    document.getElementById("txtReferrerWallet").value = ref;
    console.log("Referrer detected:", referrerAddress);
  } else {
    referrerAddress = localStorage.getItem("tvk_referrer") || null;
    if (referrerAddress) {
      document.getElementById("txtReferrerWallet").value = referrerAddress;
    }
  }

  // Update Phantom download button link based on user OS
  const downloadLink = document.getElementById("btnDownloadPhantom");
  if (downloadLink) {
    downloadLink.href = getPhantomDownloadUrl();
  }

  // Pre-load stats from Google Sheets database
  fetchStats();
});

// Check if address is a valid Solana public key (basic regex check)
function validateSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Handle address input and reveal referral links dynamically
function handleAddressInput() {
  const addressInput = document.getElementById("txtUserWallet").value.trim();
  const refContainer = document.getElementById("refLinkContainer");
  
  if (validateSolanaAddress(addressInput)) {
    userWalletAddress = addressInput;
    hideAlerts();

    // Generate and display referral link
    const refLink = `${window.location.origin}${window.location.pathname}?ref=${userWalletAddress}`;
    document.getElementById("lblRefUrl").innerText = refLink;
    refContainer.style.display = "block";
  } else {
    userWalletAddress = null;
    refContainer.style.display = "none";
  }
}

// Copy referral URL to clipboard
function copyReferralLink() {
  const urlText = document.getElementById("lblRefUrl").innerText;
  navigator.clipboard.writeText(urlText).then(() => {
    showSuccess("Referral link copied to clipboard!");
  }).catch(() => {
    showError("Failed to copy link. Please highlight and copy manually.");
  });
}

// Submit claim to Google Sheet database
async function submitClaim() {
  const addressInput = document.getElementById("txtUserWallet").value.trim();
  
  if (!addressInput) {
    return showError("Please enter your Solana wallet address first.");
  }
  if (!validateSolanaAddress(addressInput)) {
    return showError("Please enter a valid Solana wallet address (32-44 characters).");
  }

  userWalletAddress = addressInput;

  const payload = {
    wallet: userWalletAddress,
    referrer: referrerAddress || ""
  };
  
  try {
    document.getElementById("btnClaim").innerText = "Submitting claim...";
    document.getElementById("btnClaim").disabled = true;
    
    await fetch(scriptUrl, {
      method: "POST",
      mode: "no-cors", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    showSuccess("Airdrop claim submitted successfully! The creator will review and transfer your 20,000 TVK shortly.");
    fetchStats();
    if (adminPassword) {
      loadAdminClaims();
    }
  } catch (err) {
    showError("Failed to submit claim: " + err.message);
  } finally {
    document.getElementById("btnClaim").innerText = "Submit Airdrop Claim";
    document.getElementById("btnClaim").disabled = false;
  }
}

// Fetch stats from Google Sheet Web App
async function fetchStats() {
  try {
    const res = await fetch(scriptUrl);
    const data = await res.json();
    const approvedCount = data.completed || 0;
    document.getElementById("statClaims").innerText = `${approvedCount} / 25`;
  } catch (e) {
    console.error("Error fetching stats:", e);
  }
}

// Load Claims into Admin Dashboard (Requires adminPassword for authentication)
async function loadAdminClaims() {
  if (!adminPassword) return;

  let claims = [];
  try {
    const res = await fetch(`${scriptUrl}?key=${encodeURIComponent(adminPassword)}`);
    claims = await res.json();
    if (claims.status === "error") {
      showError("Authentication failed: " + claims.error);
      return;
    }
  } catch (e) {
    console.error("Failed to load claims:", e);
  }
  
  const tbody = document.getElementById("adminTableBody");
  tbody.innerHTML = "";
  
  if (claims.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No claims submitted yet.</td></tr>`;
    return;
  }
  
  // Calculate referrals count for each wallet address
  const referralCounts = {};
  claims.forEach(c => {
    if (c.referrer && c.status === "completed") {
      referralCounts[c.referrer] = (referralCounts[c.referrer] || 0) + 1;
    }
  });

  claims.forEach((claim, idx) => {
    const baseReward = 20000;
    const referrals = referralCounts[claim.wallet] || 0;
    const totalClaim = baseReward + (referrals * 1000);
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <span style="font-family: monospace;">${claim.wallet}</span>
        <button class="btn-copy" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;" onclick="copyText('${claim.wallet}')">Copy</button>
      </td>
      <td>${claim.referrer ? claim.referrer.slice(0, 6) + "..." + claim.referrer.slice(-4) : "None"}</td>
      <td>${referrals}</td>
      <td>
        <strong>${totalClaim.toLocaleString()} TVK</strong>
        <button class="btn-copy" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;" onclick="copyText('${totalClaim}')">Copy</button>
      </td>
      <td><span class="status-badge status-${claim.status}">${claim.status}</span></td>
      <td>
        ${claim.status === "pending" 
          ? `<button class="btn-action" onclick="markAsCompleted(${idx})">Mark as Sent</button>` 
          : `<span style="color: var(--success); font-weight: 600;">Sent ✓</span>`
        }
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Copy helper function for admin
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showSuccess(`Copied to clipboard: ${text}`);
  });
}

// Mark claim status as completed in Google Sheets (Requires adminPassword)
async function markAsCompleted(claimIdx) {
  if (!adminPassword) return showError("Unauthorized.");
  showSuccess("Updating status...");
  try {
    const res = await fetch(`${scriptUrl}?updateIdx=${claimIdx}&status=completed&key=${encodeURIComponent(adminPassword)}`);
    const data = await res.json();
    if (data.status === "updated") {
      showSuccess("Status updated to completed in Google Sheet!");
      loadAdminClaims();
      fetchStats();
    } else {
      showError("Failed to update status: " + data.error);
    }
  } catch (e) {
    showError("Failed to update Google Sheet: " + e.message);
  }
}

// ----------------------------------------------------
// SECRET SHORTCUT ACCESS CONTROL (FOR CREATOR ONLY)
// ----------------------------------------------------

// 1. Desktop Keyboard Shortcut (Ctrl + Shift + A or Cmd + Shift + A)
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    promptAdminLogin();
  }
});

// 2. Mobile Tap Shortcut (Tap TVK Logo 5 times quickly)
let logoClicks = 0;
let lastLogoClick = 0;

function handleLogoClick() {
  const now = Date.now();
  if (now - lastLogoClick < 1000) {
    logoClicks++;
  } else {
    logoClicks = 1;
  }
  lastLogoClick = now;

  if (logoClicks >= 5) {
    logoClicks = 0;
    promptAdminLogin();
  }
}

// Helper to hash password using SHA-256
async function hashSHA256(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Prompt Creator for secret password
async function promptAdminLogin() {
  const password = prompt("Enter Creator Security Password:");
  if (password) {
    const hash = await hashSHA256(password);
    if (hash === ADMIN_HASH) {
      adminPassword = password;
      showSuccess("Welcome, Creator! Admin dashboard unlocked successfully.");
      document.getElementById("adminSection").style.display = "block";
      loadAdminClaims();
    } else {
      showError("Access Denied: Incorrect administrator password.");
    }
  }
}

// Tutorial Modal Handlers
function toggleTutorialModal(show) {
  const modal = document.getElementById("tutorialModal");
  if (modal) {
    modal.style.display = show ? "flex" : "none";
  }
}

function closeTutorialModal(event) {
  toggleTutorialModal(false);
}

// Display Alerts
function showSuccess(msg) {
  document.getElementById("alertError").style.display = "none";
  const successDiv = document.getElementById("alertSuccess");
  successDiv.innerHTML = msg;
  successDiv.style.display = "block";
}

function showError(msg) {
  document.getElementById("alertSuccess").style.display = "none";
  const errorDiv = document.getElementById("alertError");
  errorDiv.innerHTML = msg;
  errorDiv.style.display = "block";
}

function hideAlerts() {
  document.getElementById("alertSuccess").style.display = "none";
  document.getElementById("alertError").style.display = "none";
}
