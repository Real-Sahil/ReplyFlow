# Content calendar and posts: design note

Status: proposal. Nothing here is built yet.

## Where we are

The Posts module can draft, save, post now, schedule, cancel a schedule and remove a
published post. It can attach a product (photo, price and link). Each change is in the
audit log.

What it does not do yet:

- **No calendar.** Posts are a flat list, newest first. Nothing shows what goes out on a day.
- **No media upload.** Photos are links only. A link to a page that Facebook cannot fetch fails.
- **No preview fidelity.** The preview is a plain card; it doesn't show how Facebook crops
  the image or wraps the text.
- **No review step.** Anyone who can write a post can post it. There is no "needs approval".
- **No edit after scheduling.** A scheduled post must be cancelled and recreated.
- **No results.** Reach, reactions and comments on a published post are not pulled back.
- **Not yet proven live.** `meta_connection` has no saved token, and `page_posts` has no
  rows, so nothing has been posted from the app. The Supabase secret may still work, but
  that is unverified.

## What the two reference projects do

**Mixpost (MIT)** splits the calendar into month and week views, with a post item
component for each card and a switcher between views. Scheduling is a server job
(`RunScheduledPosts`). Licence allows reuse of its ideas and snippets.

**Postiz (AGPL-3.0)** has one large calendar component (about 1,650 lines) with a shared
context, plus preview and approval-related components. Copy only from its ideas, not its code.

## Proposal

### 1. Calendar screen (`/calendar`)

- Month view by default, week view as a toggle. Day cells show post chips (time, Page,
  status colour). Drag a chip to another day to reschedule (only while still `scheduled`
  or `draft`).
- Click an empty day to start a draft already set to that date.
- Filters: status, product, author.
- Reads from `page_posts`. Facebook scheduling stays the source of truth for timing, so a
  "scheduled" chip is what Facebook will send.

### 2. Media

- Upload to a private Supabase storage bucket, with a signed URL passed to Facebook.
  Images are checked for type and size (JPEG or PNG, under 8 MB) before upload.
- Keep the photo-link field as a fallback.

### 3. Review

- New status `pending_review`. Agents submit; admins approve. Only an admin's approval
  moves a post to `scheduled` or `published`.
- Keep the audit trail for approvals.

### 4. Preview

- Show the post as it will appear in the feed, with the image cropped to Facebook's
  ratio, and the link card.

### 5. Results (later)

- Pull reach, reactions and comments with the Page Insights permission. This needs a
  separate permission check before it is built.

## Decisions needed

1. **Review:** do you want every post approved by an admin, or only posts from agents?
2. **Media:** upload to our storage (recommended), or links only?
3. **Insights:** do you want results in the app, and are you willing to add the
   Insights permission to the Meta app?

## Next steps, in order

1. Save the Page token in **Facebook connection**, then post one test draft and confirm
   it reaches the Page. This tells us whether the publishing path works at all.
2. Calendar screen (month and week).
3. Media upload.
4. Review step.
5. Preview fidelity.
