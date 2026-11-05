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

### pages_manage_posts
Publishes, schedules and deletes posts on the Page from the app's Posts screen.
- **Steps:** open Posts, choose New post, write a short post, choose the Page and publish. The
  post appears on the Page. Open it in Facebook to show it is there, then delete it from the app.

### pages_manage_engagement
Lets staff reply to and hide comments on the Page's posts, from the Comments screen.
- **Steps:** open Comments, choose a comment from the test user, type a reply and send. The reply
  shows under the comment on Facebook. Hide a comment and show it is hidden on the Page.

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

**Record the real app, signed in as the Meta test user, on a real phone or a real browser window.** Meta
checks the recording against the live app, so it must show real Facebook responses. Do not use the demo
build, mocked data or edited footage, and do not add captions: Meta's reviewers expect a plain screen
recording, with the narration (if any) spoken over it.

### Set up once
- Use the test user and test Page from the app dashboard (Roles > Test Users). No real customer
  names, messages, phone numbers or money figures may appear on screen.
- Turn on Do Not Disturb so no notification covers the screen. Close other tabs and apps.
- Start from the signed-out app so the first thing on screen is the login and the Facebook
  permission dialog. On iPhone: Control Centre screen record. In a browser: any screen recorder.
- One video per permission, under 3 minutes each. Hold each result on screen for 2 to 3 seconds.

### Shot list (what to do, in order)
1. **pages_show_list**: Facebook connection > Connect Facebook Pages. Show the Facebook dialog
   listing the permissions being granted, tick the test Page, continue. Back in the app, show the
   list of Pages and the chosen Page marked as connected.
2. **pages_manage_metadata**: stay on Facebook connection. Show Page subscriptions listing
   `messages`, `feed` and `leadgen` as active.
3. **pages_messaging**: on a second device or window, send the Page a message as the test user.
   In the app open Inbox, open that conversation, type a reply and send. Show the reply arriving
   in Messenger on the test user's side. Keep it inside the 24-hour window.
4. **pages_read_engagement**: as the test user, comment on a post on the Page. In the app open
   Posts, open that post and show the comment under it. Show the post's reach and engagement.
5. **pages_manage_engagement**: open Comments, reply to that comment, then show the reply on the
   Facebook post. Hide another comment and show it is hidden.
6. **pages_manage_posts**: Posts > New post, write a short post, publish, then show it on the Page
   in Facebook. Delete it from the app and show it gone.
7. **leads_retrieval** (only if requested): in Meta's Lead Ads Testing Tool, create a test lead on
   the Page's lead form. In the app show the new contact and deal appearing within a minute.

### Before you upload
- Watch each video once with the sound off: the permission dialog, the app action and the
  Facebook-side result must all be visible.
- Check no personal data is visible, including the Facebook sidebar, notifications and
  browser bookmarks.
- Make sure each permission's video matches the "Steps" in this file and the wording in the form.

## Data handling statement (for the form)

- Messages and comments are stored in the CRM so staff can reply. They are kept for as long as
  the customer relationship continues, and removed on request (see DATA_DELETION.md).
- Lead form answers are stored as a contact and a deal.
- Data is stored in Supabase in [SUPABASE REGION: confirm in the Supabase project settings]
  and accessed only by signed-in staff.
- We do not sell data or use it for advertising.
