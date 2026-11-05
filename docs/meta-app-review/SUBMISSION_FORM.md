# The permission request forms: what to enter

Meta shows the same form for every permission. Paste from here, one permission at a time. The steps the
reviewer follows and the shot list for the recordings are in `README.md`.

## Request only what the app uses

Request: `pages_messaging`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
`pages_manage_engagement`, `pages_manage_metadata`, and `leads_retrieval` if the lead-ad feature is being reviewed.

**Do not request Page Mentions.** It is for apps that publish posts which mention other Pages, and ReplyFlow
does not do that. If Page Mentions (or `pages_utility_messaging`, or `business_management`) is in the request
list, remove it. An unused permission is a common reason for a refusal.

## What Meta's list may show, and what to do with each

Meta lists every permission added to the submission, in no useful order. Match it against this table.

| On Meta's list | Do this |
|---|---|
| Page Mentions | **Remove it.** Not used. |
| pages_utility_messaging | **Remove it.** Not used, and utility messages are charged by Meta. |
| business_management | **Remove it for now.** Not used. If a customer's Page can only be reached through their business portfolio and will not list, add it later with its own review. |
| public_profile | Only needs the agreement ticked. It is the basic Facebook login information and needs no description or video. |
| pages_show_list | Keep. The other Page permissions require it. |
| pages_read_engagement | Keep. `pages_manage_posts`, `pages_manage_engagement` and `pages_manage_metadata` need it or `pages_show_list`. |
| pages_manage_posts, pages_manage_metadata, pages_messaging | Keep. |
| pages_manage_engagement | **Add it if it is missing.** The app replies to and hides comments with it. |
| leads_retrieval | Add only if the lead-ad feature is being reviewed. |

"Your submission must include pages_show_list" means exactly that: leave it in. To take a permission out, go to
App Review, Permissions and features, find it, and remove it from the request; it can also be removed under
Use cases, Customize.

"Ensure you have performed required API test calls" means the app must have made a successful call with that
permission. Connecting a Page and doing each step of the shot list once makes the calls; Meta can take up to a
day to count them.

## The fields that are the same on every form

| Field | What to enter |
|---|---|
| Description of how the app uses the permission | The text for that permission, below |
| Page ID | The ID of the **test Page** connected to the reviewer business (Page settings, then About, then Page ID) |
| Temporary username for your Page management tool | `meta-reviewer@example.com` (the reviewer account, an administrator of the ReplyFlow Demo business) |
| Temporary password for your Page management tool | The reviewer account's password. Type it into Meta only. Never write it in this repository |
| Where the reviewer signs in | `https://replyflow-sahil.vercel.app/app`, and the reviewer account lands on a business with the test Page already connected |
| Screen recording | One video per permission, under 3 minutes, from the shot list in `README.md` |
| Agreement | Tick it. It is a promise to use the data only as described below |

"Page management tool" on Meta's form means ReplyFlow itself.

## Descriptions to paste

Each is written to say what the person using the app gets, and why the feature cannot work without the
permission. Change nothing that the app does not do.

### pages_messaging
ReplyFlow is a customer messages and orders tool for small businesses that sell through Facebook. A business
administrator connects their own Facebook Page. When a customer messages the Page, the conversation appears in
the ReplyFlow Inbox next to that customer's contact record and orders, so staff can reply in one place. We use
pages_messaging only to send a reply to a person who has messaged the Page first, inside Messenger's 24-hour
window. We never send promotions or broadcasts. Without this permission staff would have to leave the app and
answer every message in Facebook, and the reply could not be linked to the customer's order.

### pages_messaging: "instructions to reproduce" (paste this too)
1. Open `https://replyflow-sahil.vercel.app/app` and sign in with the username and password given above.
2. Open the user menu, then Facebook connection, and check the test Page is connected.
3. On Facebook, as the test customer account, send a message to the test Page.
4. In ReplyFlow open Inbox. The conversation appears within a few seconds. Open it, type a reply and press Send.
5. The reply arrives in Messenger for the test customer account. Replies can only be sent within 24 hours of the
   customer's last message; after that the app shows the window has closed and does not send.

### pages_show_list
When an administrator chooses to connect Facebook, ReplyFlow needs the list of Pages that person manages so
they can choose which Page to connect. The list is shown once, on the Facebook connection screen, and only the
Page the administrator ticks is connected. Without it the administrator would have to find and type a Page ID
by hand.

### pages_read_engagement
ReplyFlow reads the comments on the connected Page's posts so staff can answer them from the Comments screen,
and reads each post's reach and engagement so the business can see which posts worked. Comments are stored with
the customer's name and the post they were on. Without this permission staff would not see comments unless they
watched the Page, and customers' questions would go unanswered.

### pages_manage_posts
Staff write a post in ReplyFlow (optionally choosing a product and a photo), then save it as a draft, send it
for review, schedule it or publish it to the connected Page, and can delete it again from the app. ReplyFlow can
also draft a caption from a product's details; such a post waits for a staff member's approval unless an
administrator has chosen to switch on auto-approval. Without this permission the business would have to post
each item by hand in Facebook and could not plan a week of posts in one sitting.

### pages_manage_engagement
Staff reply to comments on the Page's posts, and hide a comment (for example abuse or spam), from the Comments
screen. Each reply is written by a staff member. Without this permission staff would have to open each post in
Facebook to answer a customer's comment.

### pages_manage_metadata
ReplyFlow subscribes the connected Page to the events it needs: new messages, comments on posts and, for
businesses that run lead ads, new leads. This lets a message, a comment or a lead arrive in the app
straight away instead of staff having to check. The Facebook connection screen lists the subscriptions that
are active so the administrator can see what the app is listening to.

### leads_retrieval (only if requested)
When a person completes a lead form on the business's lead ad, ReplyFlow fetches the answers they gave and
creates a contact and a deal, so the business can follow up. Only the fields on that form are read. Without it
the business would have to download leads from Facebook and type them in.

## Data handling (for the form's data questions)
Messages, comments and lead answers are stored in ReplyFlow so staff can reply and follow up. They are kept
while the business is in touch with the customer and removed when the customer or business asks (see
`DATA_DELETION.md`). Data is stored in Supabase and read only by signed-in staff of that business; every
business is separate. It is not sold or used for advertising. The privacy policy is at `/privacy`.

## Before you press Submit

- Business verification is approved.
- The data deletion callback and the privacy policy URL are set in the app's Basic settings.
- The reviewer account can sign in with the password you will type into Meta, and its business has the test Page
  connected and a test message and comment waiting.
- Each video matches its permission's text above. No real names, messages or figures are visible.
