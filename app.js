const MINT_ADDRESS = "k9uz5aSAFQAb2wMLuP2MU73FnwJRMThcsfmmr5KbQ3E";
const CREATOR_WALLET = "24CbJMAacduVCbxqKroXPUGed8dHUBPWYGuySDh7fmWn";

let userWalletAddress = null;
let referrerAddress = null;

// Google Apps Script URL for live database
const scriptUrl = "https://script.google.com/macros/s/AKfycbwpF_qLZypzzhsCgdqXSMvmN6_OwFMsgnG8THtyjtCvo57dwjaDxkN3ZhKxJRtow-1nbQ/exec";

window.addEventListener("load", () => {
  // Check for referrer in URL params: e.g., ?ref=WALLET_ADDRESS
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get("ref");
  if (ref && validateSolanaAddress(ref)) {
    referrerAddress = ref;
    localStorage.setItem("tvk_referrer", ref);
    console.log("Referrer detected:", referrerAddress);
  } else {
    referrerAddress = localStorage.getItem("tvk_referrer") || null;
  }
  
  document.getElementById("txtScriptUrl").value = scriptUrl;
  fetchStats();
});

// Check if address is a valid Solana public key (basic length and character check)
function validateSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

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

// Helper to retrieve any available Solana wallet provider
function getProvider() {
  if (window.solana) {
    return window.solana;
  }
  if ('phantom' in window) {
    return window.phantom?.solana;
  }
  return null;
}

// Connect / Disconnect Phantom Wallet (Uses local wallet injection, no RPC needed)
async function toggleWallet() {
  const provider = getProvider();

  if (provider) {
    if (userWalletAddress) {
      // Disconnect
      await provider.disconnect();
      userWalletAddress = null;
      document.getElementById("btnConnect").innerText = "Connect Wallet";
      document.getElementById("userSection").style.display = "none";
      document.getElementById("adminSection").style.display = "none";
      hideAlerts();
    } else {
      // Connect
      try {
        const response = await provider.connect();
        userWalletAddress = response.publicKey.toString();
        document.getElementById("btnConnect").innerText = "Connected";
        document.getElementById("txtUserWallet").value = userWalletAddress;
        document.getElementById("userSection").style.display = "block";
        
        // Generate Referral Link
        const refLink = `${window.location.origin}${window.location.pathname}?ref=${userWalletAddress}`;
        document.getElementById("lblRefUrl").innerText = refLink;
        
        // Display admin panel if creator wallet connects
        if (userWalletAddress === CREATOR_WALLET) {
          document.getElementById("adminSection").style.display = "block";
          loadAdminClaims();
        } else {
          document.getElementById("adminSection").style.display = "none";
        }
        hideAlerts();
      } catch (err) {
        showError("Wallet connection rejected by user.");
      }
    }
  } else {
    const downloadUrl = getPhantomDownloadUrl();
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      // Phantom mobile deep link to open this site in Phantom's in-app browser
      const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}`;
      showError(`Wallet not detected. If you have a wallet installed, please tap here: <a href="${deepLink}" target="_blank" style="color: #ff8c00; font-weight: 700; text-decoration: underline;">Open in Phantom App</a> to claim your rewards, or install Phantom from your App Store.`);
    } else {
      // Desktop
      showError(`Solana Wallet extension not found. Please <a href="${downloadUrl}" target="_blank" style="color: #ff8c00; font-weight: 600; text-decoration: underline;">install Phantom Wallet</a> to claim your rewards.`);
    }
  }
}

// Save Google Apps Script URL in Admin Panel
function saveScriptUrl() {
  scriptUrl = document.getElementById("txtScriptUrl").value.trim();
  localStorage.setItem("tvk_script_url", scriptUrl);
  showSuccess("Google Script API URL saved successfully!");
  fetchStats();
  if (userWalletAddress === CREATOR_WALLET) {
    loadAdminClaims();
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

// Submit claim to DB (Google Sheet or Mock)
async function submitClaim() {
  if (!userWalletAddress) return showError("Please connect your wallet first.");
  
  const payload = {
    wallet: userWalletAddress,
    referrer: referrerAddress || ""
  };
  
  try {
    document.getElementById("btnClaim").innerText = "Submitting claim...";
    document.getElementById("btnClaim").disabled = true;
    
    if (scriptUrl) {
      const response = await fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      showSuccess("Claim submitted! The creator will review and send your 20,000 TVK shortly.");
      fetchStats();
    } else {
      // Fallback: LocalStorage Mock database
      let claims = JSON.parse(localStorage.getItem("tvk_mock_claims") || "[]");
      if (claims.some(c => c.wallet === userWalletAddress)) {
        showError("You have already submitted a claim with this wallet.");
      } else {
        claims.push({
          wallet: userWalletAddress,
          referrer: referrerAddress || "",
          timestamp: new Date().toISOString(),
          status: "pending"
        });
        localStorage.setItem("tvk_mock_claims", JSON.stringify(claims));
        showSuccess("Mock Claim submitted successfully! (Connecting your Google Sheet URL is recommended for production).");
        updateMockStats();
        if (userWalletAddress === CREATOR_WALLET) {
          loadAdminClaims();
        }
      }
    }
  } catch (err) {
    showError("Failed to submit claim: " + err.message);
  } finally {
    document.getElementById("btnClaim").innerText = "Submit Airdrop Claim";
    document.getElementById("btnClaim").disabled = false;
  }
}

// Fetch stats from Google Sheet / Local Mock
async function fetchStats() {
  if (!scriptUrl) return;
  try {
    const res = await fetch(scriptUrl);
    const claims = await res.json();
    const approvedCount = claims.filter(c => c.status === "completed").length;
    document.getElementById("statClaims").innerText = `${approvedCount} / 25`;
  } catch (e) {
    console.error("Error fetching stats:", e);
  }
}

// Update stats from Local Storage (Mock mode)
function updateMockStats() {
  const claims = JSON.parse(localStorage.getItem("tvk_mock_claims") || "[]");
  const approvedCount = claims.filter(c => c.status === "completed").length;
  document.getElementById("statClaims").innerText = `${approvedCount} / 25`;
}

// Load Claims into Admin Dashboard (Simple List - No RPC needed)
async function loadAdminClaims() {
  let claims = [];
  if (scriptUrl) {
    try {
      const res = await fetch(scriptUrl);
      claims = await res.json();
    } catch (e) {
      console.error("Failed to load claims:", e);
    }
  } else {
    claims = JSON.parse(localStorage.getItem("tvk_mock_claims") || "[]");
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
    showSuccess(`Copied: ${text}`);
  });
}

// Mark claim status as completed in DB
async function markAsCompleted(claimIdx) {
  showSuccess("Updating status...");
  
  if (scriptUrl) {
    try {
      await fetch(scriptUrl + `?updateIdx=${claimIdx}&status=completed`);
      showSuccess("Status updated to completed in Google Sheet!");
    } catch (e) {
      showError("Failed to update Google Sheet: " + e.message);
      return;
    }
  } else {
    let claims = JSON.parse(localStorage.getItem("tvk_mock_claims") || "[]");
    claims[claimIdx].status = "completed";
    localStorage.setItem("tvk_mock_claims", JSON.stringify(claims));
    showSuccess("Mock Status updated to completed!");
  }
  
  // Reload dashboard UI
  loadAdminClaims();
  if (scriptUrl) fetchStats(); else updateMockStats();
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
