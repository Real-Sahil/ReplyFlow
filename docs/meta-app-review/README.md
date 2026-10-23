# Meta app review pack

Everything Meta asks for when reviewing advanced access for the ReplyFlow app. Keep this in
step with the code: when a feature changes, update the matching section.

## Before you submit

- **Business verification** must be approved (Business settings → Security Center).
- **Data deletion** URL is set to `https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/data_deletion`
  (App settings → Basic → Data deletion callback URL). It is also linked from `DATA_DELETION.md`.
- **Privacy policy** URL is set to the published `PRIVACY_POLICY.md` on the Mere & Row website.
- **Test user**: create a Facebook test user, add them as a Page role (Editor), and give the
  reviewer their login through the app dashboard's Test Users page. Do not put passwords in
  this repository.
- **Only request what the app uses.** Do not request `pages_utility_messaging` or
  `business_management`. We do not use them, and utility messages are charged by Meta.

## Permissions and what they are for

### pages_messaging (already granted)
Reply to customers who messaged the Page, within Messenger's 24-hour window.
- **Steps for the reviewer:** open Messenger from the Inbox screen. Pick a conversation that
  has a message from the test user. Type a reply and press Send. The reply appears in
  Messenger on the test user's account.

### pages_show_list
Lists the Pages the signed-in administrator manages, so they can choose which Page to connect.
- **Steps:** open Facebook connection. The list of Pages you manage appears. Choose the
  Page and connect it.

### pages_read_engagement
Reads comments on the Page's posts so staff can reply to them, and reads post performance
(reach, engagement) to show what worked.
- **Steps:** open Posts, then a published post. Its comments appear under the post. Staff can
  reply from the Comments screen.

### pages_manage_metadata
Subscribes the Page to lead-ad and comment events, so new leads arrive without manual entry.
- **Steps:** open Facebook connection and look at **Page subscriptions**. It lists the events
  the Page is subscribed to, such as `leadgen` and `feed`. A subscription is set up in the
  Meta app dashboard (Messenger API Settings or Webhooks), and this screen confirms it.

### leads_retrieval (requested with the lead-ad feature)
Fetches the answers a person gave on a Facebook lead form, to create a contact and deal.
- **Steps:** create a test lead on a lead form in Meta's Lead Ads Testing Tool. A new contact
  and deal appear in the CRM within a minute.

## Screen recording guide

Record one short video per permission (under 3 minutes each), with no real customer data on
screen. Narrate what the feature does and why the app needs the permission. Show each step
in the "Steps" list above.

## Data handling statement (for the form)

- Messages and comments are stored in the CRM so staff can reply. They are kept for as long as
  the customer relationship continues, and removed on request (see DATA_DELETION.md).
- Lead form answers are stored as a contact and a deal.
- Data is stored in Supabase in [SUPABASE REGION: confirm in the Supabase project settings]
  and accessed only by signed-in staff.
- We do not sell data or use it for advertising.
