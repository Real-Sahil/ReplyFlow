# Spreadsheet export

A Google Sheet can pull the open deals and the orders from ReplyFlow every morning.
Nothing is written back to ReplyFlow, and the sheet only ever reads.

## Set-up (about ten minutes, once)

1. **Pick a key.** Make a long random string, for example from a password manager.
   It is the only secret in this setup.
2. **Give the key to the function.** In the Supabase dashboard, open
   Edge Functions > Secrets and add `PIPELINE_EXPORT_KEY` with that value.
3. **Create the sheet.** Make a new Google Sheet. Open Extensions > Apps Script,
   delete the placeholder code, and paste in `docs/sheets/PipelineExport.gs`.
4. **Set the properties.** In Apps Script, open Project Settings > Script properties
   and add:
   - `EXPORT_KEY`: the same key as in step 1.
   - `EXPORT_URL`: `https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/pipeline_export`
5. **Run it once.** In the editor, choose `importPipeline` and press Run. Google asks
   you to approve access to the sheet and to the internet. Check that the `deals` and
   `orders` tabs fill in.
6. **Schedule it.** Choose `createNightlyImport` and press Run. Imports then run
   every day at about 06:00.

## What the sheet holds

- **deals**: open deals (archived ones are left out), with stage, amount, owner,
  lead band and score, and the last update. Up to 5,000 rows.
- **orders**: every order with its prices, paid and balance amounts, and the next
  customer update due.

Each tab is replaced on every import, so change the sheet's own columns on a copy,
not on the tabs themselves. A "Last import" time sits in column Z.

## Good to know

- Values that begin with `=`, `+`, `-` or `@` are shown as text, so a customer name
  cannot run a formula in the sheet.
- If the key changes, update it in both places (steps 2 and 4), or the import fails
  with a 401.
- An import that fails shows up in Apps Script's Executions list.
