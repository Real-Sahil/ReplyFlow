# Meta setup: do it once, at the end

Everything below is built and deployed, but only works once these Meta settings
are in place. The page access token's permissions are fixed when it is generated,
so generate it **once, after** the permissions below are added to the app.

## 1. Permissions to add (Use cases, then Customize)

| Use case | Permissions |
|---|---|
| Engage with customers on Messenger | `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement` |
| Manage everything on your Page | `pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_content`, `pages_read_engagement` |

Names are from memory of Meta's list. If one is missing or renamed, pick the
closest and tell the developer which one failed.

## 2. Page subscriptions (Messenger API settings, Add Subscriptions)

| Field | Used for |
|---|---|
| `messages` | customer messages (already on) |
| `messaging_referrals` | which ad or link started a chat (already on) |
| `messaging_postbacks` | button taps (already on) |
| `message_echoes` | replies typed in the Facebook Page inbox |
| `feed` | comments on Page posts |

## 3. Generate the page token last

1. Add the permissions above.
2. Messenger API settings, step 2, **Generate token** for the Mere & Row Page.
3. Supabase, Edge Functions, Secrets: set `META_PAGE_ACCESS_TOKEN` to the new value.
4. Optional: set `META_PAGE_ID` to `1297417513461576`.

## 4. Checks after the token is in

- Message the Page from an account with a role on the app: the contact gets the
  real Facebook name, not "Messenger enquiry 1234".
- Reply from the Inbox: it arrives in Messenger.
- Comment on a Page post: it appears under Inbox, Comments.
- Reply to a customer from the Facebook Page inbox: it appears in the conversation.

## Secrets already set in Supabase

`META_APP_SECRET`, `META_VERIFY_TOKEN`.
