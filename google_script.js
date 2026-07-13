/**
 * Google Apps Script backend database for TVK Airdrop Landing Page.
 * Paste this script into your Google Sheet's Apps Script editor (Extensions -> Apps Script).
 * Deploy it as a Web App (Anyone, even anonymous has access).
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000); // Prevent concurrent write race conditions

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    var wallet = data.wallet.trim();
    var referrer = data.referrer ? data.referrer.trim() : "";
    var timestamp = new Date();

    // Setup headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Wallet Address", "Referrer Address", "Timestamp", "Status"]);
    }

    // Check if wallet already submitted a claim to prevent duplicates
    if (sheet.getLastRow() > 1) {
      var wallets = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < wallets.length; i++) {
        if (wallets[i][0].toLowerCase() === wallet.toLowerCase()) {
          return ContentService.createTextOutput(JSON.stringify({ status: "duplicate", error: "Wallet already claimed" }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // Append submission
    sheet.appendRow([wallet, referrer, timestamp, "pending"]);
    return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Setup headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Wallet Address", "Referrer Address", "Timestamp", "Status"]);
  }

  // Handle updates from admin dashboard: ?updateIdx=CLAIM_INDEX&status=completed
  if (e.parameter.updateIdx !== undefined && e.parameter.status !== undefined) {
    var idx = parseInt(e.parameter.updateIdx) + 2; // Rows are 1-indexed, header is row 1, so index 0 is row 2
    sheet.getRange(idx, 4).setValue(e.parameter.status);
    return ContentService.createTextOutput(JSON.stringify({ status: "updated" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fetch all claims to display in dashboard
  var rows = sheet.getDataRange().getValues();
  var claims = [];
  for (var i = 1; i < rows.length; i++) {
    claims.push({
      wallet: rows[i][0],
      referrer: rows[i][1],
      timestamp: rows[i][2],
      status: rows[i][3]
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify(claims))
    .setMimeType(ContentService.MimeType.JSON);
}
