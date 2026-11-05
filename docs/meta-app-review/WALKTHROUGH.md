# Meta: the whole route, in order

From an app in development to approved permissions, plus how a first customer tests meanwhile. Menu names
below are from Meta's documentation and may be renamed; use the dashboard's search box if one has moved.
Details for each form are in `SUBMISSION_FORM.md`; the recording shot list is in `README.md`.

## A. Set the app up once (developers.facebook.com, My Apps, your app)

1. **App settings, Basic.**
   - Privacy policy URL: `https://replyflow-sahil.vercel.app/privacy`
   - User data deletion (callback URL): `https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/data_deletion`
   - App icon (1024 x 1024: `public/appIcon/1024.png`), category, contact email.
   - Business account: link the app to your business portfolio.
2. **Business verification.** In business.facebook.com, Settings, Security Center, Start verification. It must be
   approved before Advanced Access is granted.
3. **Use cases (or Add products).** Add the Messenger use case and the one for managing the Page. Under each,
   Customize, and add only: `pages_messaging`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata` (+ `leads_retrieval` if reviewed).
   Do not add Page Mentions, `pages_utility_messaging` or `business_management`.
4. **Messenger API settings, Webhooks.** Callback URL `https://mdhmuyhtimjkysvsardi.supabase.co/functions/v1/messenger_webhook`,
   the verify token from the Supabase secret `META_VERIFY_TOKEN`. Subscribe the fields `messages`,
   `messaging_postbacks`, `messaging_referrals`, `message_echoes` and `feed` (and `leadgen` for lead ads).

## B. A test user and a test Page

1. **App roles, Test users, Create test users.** Make two: one that owns the Page, one that plays the customer.
2. Use a separate browser profile (or a private window). For each test user, **Edit, Log in as this test user**
   (a test user cannot sign in on facebook.com the usual way).
3. As the owner test user, create a Page (for example "ReplyFlow Test Shop"). Its **Page ID** is in the Page's
   About (Page transparency) section. This is the ID Meta's forms ask for.
4. Only people with a role on the app, and test users, can see test users and test Pages. That is expected.

## C. Connect the Page in ReplyFlow (as the reviewer)

1. Sign in at `https://replyflow-sahil.vercel.app/app` as `meta-reviewer@example.com`.
2. User menu (top right), **Facebook connection**, **Connect Facebook Pages**.
3. In the Facebook dialog (as the owner test user in that browser profile) read the permissions, tick the test
   Page, continue. Back in ReplyFlow the Page shows as connected and **Page subscriptions** lists the events.
4. As the customer test user, message the Page and comment on a post, so there is something to reply to.

## D. Make the API calls Meta counts

Advanced Access needs at least one successful call per permission. Doing each step of the shot list once makes
them: reply in the Inbox, publish a post, reply to and hide a comment, read comments. Meta can take up to a day
to show the calls in App Review, Permissions and features. Wait for the counts before you submit.

## E. Record, then submit

1. Record one video per permission (see `README.md`), signed in as the reviewer, no captions, nothing personal.
2. App Dashboard, **App Review, Permissions and features**. For each permission, **Request advanced access** (or
   Get advanced access), then **Continue to app review**. You land on **App Review, Requests**.
3. For each permission: paste the description, the Page ID, the reviewer username and password (typed into Meta
   only), upload that permission's video, tick the agreement.
4. Submit. Reviews usually take a few working days; Meta may ask for more. Answer in the same thread.

## F. After approval

Switch the app from Development to **Live** (the toggle at the top of the dashboard). From then on any Page
administrator can connect their Page, and customers' messages are delivered. Until then only people with a role
on the app are served.

## G. A first customer testing in the meantime

1. We set up their business in ReplyFlow (More, Businesses) and pass on the one-time password.
2. App roles, **Roles, Add people**, role **Tester**, enter their Facebook name or ID. They accept at
   facebook.com (Settings, Business Integrations, or the invitation notification).
3. They must be an **administrator of the Page** they connect. They sign in to ReplyFlow, open **Facebook
   connection**, connect their Page and tick it.
4. Only testers' messages are delivered while the app is in Development. Tell their customers nothing yet.
5. The customer does not record for Meta. We record with the test user and test Page.
