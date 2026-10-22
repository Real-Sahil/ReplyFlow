// Pulls the open pipeline and the orders from ReplyFlow into this spreadsheet.
// Paste into Extensions > Apps Script, then follow docs/SHEETS_EXPORT.md.
// The export key lives in Script properties, never in this file.

var TABLES = ['deals', 'orders'];

// Run by the nightly trigger, or by hand from the editor.
function importPipeline() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('EXPORT_KEY');
  var base = props.getProperty('EXPORT_URL');
  if (!key || !base) {
    throw new Error('Set EXPORT_KEY and EXPORT_URL in Project Settings > Script properties.');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TABLES.forEach(function (table) {
    var response = UrlFetchApp.fetch(base + '?table=' + table, {
      headers: { 'x-export-key': key },
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      throw new Error(table + ' export failed with HTTP ' + response.getResponseCode());
    }
    var rows = Utilities.parseCsv(response.getContentText());
    var sheet = ss.getSheetByName(table) || ss.insertSheet(table);
    sheet.clearContents();
    if (rows.length) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    }
    sheet.setFrozenRows(1);
    sheet.getRange('Z1').setValue('Last import');
    sheet.getRange('Z2').setValue(new Date());
  });
}

// Run once: adds a daily import at 06:00.
function createNightlyImport() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'importPipeline') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('importPipeline').timeBased().everyDays(1).atHour(6).create();
}
