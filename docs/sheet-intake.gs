/**
 * ============================================================================
 * Legroom website inquiries -> Google Sheet
 *
 * Paste this whole file into the Sheet's Apps Script editor and deploy it as
 * a web app. The Worker POSTs one row per submission. Setup steps are in
 * docs/SHEET-SETUP.md.
 *
 * WHY APPS SCRIPT and not Zapier or a service account: it is free, it runs
 * inside the Workspace that already owns the Sheet, no third party ever holds
 * prospect data, and there is no API key to rotate. The tradeoff is that a web
 * app deployed as "anyone with the link" is a genuinely public URL, which is
 * what SECRET is for. Anyone who learns the URL can POST to it; only someone
 * who also knows the secret can write a row.
 * ========================================================================= */

/**
 * CHANGE THIS before you deploy, and use the same value when you set the
 * SHEET_WEBHOOK_SECRET Wrangler secret. Any long random string. It is not a
 * password anyone types, so make it long and never reuse one.
 */
var SECRET = "CHANGE-ME";

/** The tab the rows land on. Created automatically if it is missing. */
var TAB = "Inquiries";

var HEADERS = [
  "Received",
  "Source",
  "First name",
  "Last name",
  "Email",
  "Website",
  "What is disappearing",
  "Status",
  "Notes",
];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Compared before anything else. An unauthenticated POST must not be able
    // to cause a write, or even to learn whether the sheet exists.
    if (!body.secret || body.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }

    var sheet = getSheet();

    // Pacific, because that is the clock the person reading this is on, and a
    // real Date rather than a string so the column sorts and filters properly.
    var received = body.created_at ? new Date(body.created_at) : new Date();

    sheet.appendRow([
      received,
      body.source || "",
      body.first_name || "",
      body.last_name || "",
      body.email || "",
      body.website || "",
      body.message || "",
      "New", // Status. The dropdown is set up in setUpSheet.
      "", // Notes. Yours to fill in before the call.
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** A GET is only ever a human checking the URL is alive. It writes nothing. */
function doGet() {
  return json({ ok: true, service: "legroom intake" });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB);
  if (!sheet) {
    sheet = ss.insertSheet(TAB);
  }
  if (sheet.getLastRow() === 0) {
    setUpSheet(sheet);
  }
  return sheet;
}

/**
 * Formatting, applied once. Worth doing properly: this is the surface someone
 * looks at ten seconds before a call, so it has to be readable at a glance
 * rather than a wall of raw strings.
 */
function setUpSheet(sheet) {
  sheet.appendRow(HEADERS);

  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setFontWeight("bold").setBackground("#23221f").setFontColor("#ffffff");
  sheet.setFrozenRows(1);

  sheet.getRange("A:A").setNumberFormat("ddd d mmm, h:mm am/pm");
  sheet.setColumnWidth(1, 150); // Received
  sheet.setColumnWidth(2, 90); // Source
  sheet.setColumnWidth(3, 120); // First name
  sheet.setColumnWidth(4, 120); // Last name
  sheet.setColumnWidth(5, 230); // Email
  sheet.setColumnWidth(6, 200); // Website
  sheet.setColumnWidth(7, 380); // What is disappearing
  sheet.setColumnWidth(8, 110); // Status
  sheet.setColumnWidth(9, 300); // Notes

  // The two free-text columns wrap. Everything else clipping keeps each row
  // one line tall, which is what makes the sheet scannable at a glance.
  sheet.getRange("G:G").setWrap(true);
  sheet.getRange("I:I").setWrap(true);

  var status = SpreadsheetApp.newDataValidation()
    .requireValueInList(["New", "Replied", "Booked", "Won", "No fit"], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange("H2:H").setDataValidation(status);

  // New rows are the ones that need you. They stop being highlighted the
  // moment you move the status on, which makes the sheet self-clearing.
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="New"')
    .setBackground("#fff6d6")
    .setRanges([sheet.getRange("A2:I")])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Run this ONCE from the editor, before deploying, to lay out an empty sheet.
 * Not required: the first submission would do it. It just means you can see
 * the shape of the thing before any real data arrives.
 */
function initialise() {
  getSheet();
}
