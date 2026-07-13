const MINT_ADDRESS = "k9uz5aSAFQAb2wMLuP2MU73FnwJRMThcsfmmr5KbQ3E";
const CREATOR_WALLET = "24CbJMAacduVCbxqKroXPUGed8dHUBPWYGuySDh7fmWn";
const scriptUrl = "https://script.google.com/macros/s/AKfycbwpF_qLZypzzhsCgdqXSMvmN6_OwFMsgnG8THtyjtCvo57dwjaDxkN3ZhKxJRtow-1nbQ/exec";

let userWalletAddress = null;
let referrerAddress = null;

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

// Handle address input and reveal features dynamically
function handleAddressInput() {
  const addressInput = document.getElementById("txtUserWallet").value.trim();
  const refContainer = document.getElementById("refLinkContainer");
  const adminSection = document.getElementById("adminSection");
  
  if (validateSolanaAddress(addressInput)) {
    userWalletAddress = addressInput;
    hideAlerts();

    // Generate and display referral link
    const refLink = `${window.location.origin}${window.location.pathname}?ref=${userWalletAddress}`;
    document.getElementById("lblRefUrl").innerText = refLink;
    refContainer.style.display = "block";

    // Reveal Creator Admin Dashboard automatically if creator address is pasted
    if (userWalletAddress === CREATOR_WALLET) {
      adminSection.style.display = "block";
      loadAdminClaims();
    } else {
      adminSection.style.display = "none";
    }
  } else {
    // Hide panels if address is incomplete or invalid
    userWalletAddress = null;
    refContainer.style.display = "none";
    adminSection.style.display = "none";
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
    if (userWalletAddress === CREATOR_WALLET) {
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
    const claims = await res.json();
    const approvedCount = claims.filter(c => c.status === "completed").length;
    document.getElementById("statClaims").innerText = `${approvedCount} / 25`;
  } catch (e) {
    console.error("Error fetching stats:", e);
  }
}

// Load Claims into Admin Dashboard (No Web3/RPC dependencies)
async function loadAdminClaims() {
  let claims = [];
  try {
    const res = await fetch(scriptUrl);
    claims = await res.json();
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

// Mark claim status as completed in Google Sheets
async function markAsCompleted(claimIdx) {
  showSuccess("Updating status...");
  try {
    await fetch(scriptUrl + `?updateIdx=${claimIdx}&status=completed`);
    showSuccess("Status updated to completed in Google Sheet!");
    loadAdminClaims();
    fetchStats();
  } catch (e) {
    showError("Failed to update Google Sheet: " + e.message);
  }
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
