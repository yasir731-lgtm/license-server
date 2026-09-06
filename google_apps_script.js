/**
 * =========================================================================================
 *  HASSAN AUTOFARM PRO - GOOGLE SHEETS LICENSE WEBHOOK (MOBILE CONTROL OPTION)
 * =========================================================================================
 * 
 *  HOW TO USE (TARIQA CAR):
 *  ------------------------
 *  1. Go to Google Sheets (drive.google.com) and create a new blank sheet.
 *  2. Name the sheet "Hassan AutoFarm Licenses".
 *  3. In Sheet1, write these headers in Row 1:
 *     Col A: Key
 *     Col B: Client_Name
 *     Col C: HWID
 *     Col D: Status          (Type 'ACTIVE' or 'DISABLED')
 *     Col E: Expiry_Date     (Type '2026-12-31' or 'Lifetime')
 *     Col F: Phone
 *     Col G: Notes
 * 
 *  4. In the top menu, click: Extensions -> Apps Script
 *  5. Delete any existing code and paste this entire file contents into Code.gs
 *  6. Click "Deploy" (top right button) -> "New deployment"
 *     - Select type: "Web app"
 *     - Execute as: "Me"
 *     - Who has access: "Anyone" (Zaroori hai taake client app connect kar sake)
 *     - Click "Deploy"
 *  7. Copy the "Web app URL" (e.g. https://script.google.com/macros/s/AKfycbx.../exec)
 *  8. Paste this URL into your desktop software's 'license_config.json':
 *     {
 *       "remote_server_url": "YOUR_GOOGLE_WEB_APP_URL",
 *       "server_type": "google_sheets"
 *     }
 * 
 *  DONE! Ab aap apne mobile se Google Sheet app khol kar kisi ka bhi Status
 *  'ACTIVE' se 'DISABLED' karenge to software usi waqt band/lock ho jayega!
 * =========================================================================================
 */

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    return handleRequest(data);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      valid: false,
      status: "ERROR",
      message: "Invalid request payload: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var data = e && e.parameter ? e.parameter : {};
  return handleRequest(data);
}

function handleRequest(data) {
  var key = (data.key || "").toString().trim();
  var clientHwid = (data.hwid || "").toString().trim();
  
  if (!key) {
    return jsonResponse({ valid: false, status: "UNLICENSED", message: "No license key provided." });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  
  // Row 0 is header: [Key, Client_Name, HWID, Status, Expiry_Date, Phone, Notes]
  var foundRowIndex = -1;
  var lic = null;

  for (var i = 1; i < rows.length; i++) {
    var rowKey = (rows[i][0] || "").toString().trim();
    if (rowKey.toUpperCase() === key.toUpperCase()) {
      foundRowIndex = i + 1; // 1-indexed sheet row
      lic = {
        key: rowKey,
        client_name: (rows[i][1] || "Client").toString().trim(),
        hwid: (rows[i][2] || "").toString().trim(),
        status: (rows[i][3] || "ACTIVE").toString().trim().toUpperCase(),
        expiry: (rows[i][4] || "Lifetime").toString().trim()
      };
      break;
    }
  }

  if (!lic) {
    return jsonResponse({
      valid: false,
      status: "NOT_FOUND",
      message: "License key not found in system. Contact Hassan."
    });
  }

  // 1. Check if Admin turned OFF the switch
  if (lic.status === "DISABLED" || lic.status === "OFF" || lic.status === "BLOCKED") {
    return jsonResponse({
      valid: false,
      status: "DISABLED",
      client_name: lic.client_name,
      message: "⚠️ License has been DEACTIVATED by administrator."
    });
  }

  // 2. Check Expiration
  if (lic.expiry.toLowerCase() !== "lifetime") {
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (lic.expiry < today) {
      return jsonResponse({
        valid: false,
        status: "EXPIRED",
        client_name: lic.client_name,
        expires_at: lic.expiry,
        message: "⚠️ License expired on " + lic.expiry
      });
    }
  }

  // 3. HWID Binding (1 Key = 1 PC Lock)
  if (lic.hwid && clientHwid && lic.hwid.toUpperCase() !== clientHwid.toUpperCase()) {
    return jsonResponse({
      valid: false,
      status: "DEVICE_MISMATCH",
      client_name: lic.client_name,
      message: "⚠️ Hardware ID mismatch! Key is locked to another computer."
    });
  }

  // First time activation: Save HWID into Column C (Col 3)
  if (!lic.hwid && clientHwid && foundRowIndex > 1) {
    sheet.getRange(foundRowIndex, 3).setValue(clientHwid);
  }

  return jsonResponse({
    valid: true,
    status: "ACTIVE",
    client_name: lic.client_name,
    expires_at: lic.expiry,
    days_remaining: 365,
    message: "License verified active."
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
