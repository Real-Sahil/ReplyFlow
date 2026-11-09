# Social posting and channels: how the workflow is designed

This page is the design for posting to, and working with, more than one platform and more than one account.
It says what the pieces are, how they relate, who may do what, and what is built now and what comes next.

## The three ideas

**Channel.** A place content can go to or be read from. A channel is one of:

| Platform | Kind | What it is | Belongs to |
|---|---|---|---|
| Facebook | Page | A Facebook Page the business connected | The business |
| LinkedIn | Page | A LinkedIn company Page an administrator connected | The business |
| LinkedIn | Profile | One person's own LinkedIn profile | That person only |

A channel has a key (`facebook:page:123`, `linkedin:page:456`, `linkedin:profile:7`), a name, and a health
(fine, expires soon, expired). One database view, `social_channels`, lists every channel the signed-in person
can use, so no screen has to know which table each came from. A person never sees another person's profile.

**Post.** The content (words, photo, link) and its approval. A post is approved once, by one person, and that
approval covers the words and every version of the words (see below).

**Destination.** One post going to one channel. A destination has its own state, an optional version of the
words, an optional time, and the platform's own reference once it is posted. One post has any number of
destinations, so one post can go to two LinkedIn Pages and a profile, whatever is connected.

## States

A destination moves one way, with one loop for trying again:

`planned` (chosen, not sent) → `scheduled` (will go out at its time) → `published` → `removed`

`failed` can come from `scheduled` or from a post attempt, and goes back to `planned` or `scheduled` when the
person tries again. Only the server moves a destination to `published`, `failed` or `removed`.

## Who may do what

* Staff (not viewers) can choose destinations at any time, including after a post has gone to Facebook, so a post
  can be sent to another channel later. A **version of the words** can be written by any member of staff while the
  post is a draft, in review or failed. Once the post is approved, only an administrator can add or change one.
* A person may choose their **own** LinkedIn profile only, never someone else's. The database enforces it.
* A LinkedIn Page destination is allowed only for Pages connected to the same business.
* A version of the words is part of the post, so approving the post approves it. Nobody posts words that nobody
  has seen: what is posted is the destination's version if it has one, otherwise the post's own words.
* Connecting a Page, or connecting for ads, is for administrators.
* Everything that publishes, retries or removes runs on the server with the stored token. The browser never holds
  a token.

## Time

A post has one planned time. Every destination follows it unless it has its own.

* **Facebook** schedules inside Facebook, as it always has.
* **LinkedIn** cannot schedule, so ReplyFlow does: a job runs every five minutes, finds destinations that are
  `scheduled` and due, and posts them. A failure is saved on the destination and the administrators are told.

## Screens

* **Accounts** (`/channels`): every connected channel with its health and how to connect or reconnect. One
  place, both platforms.
* **Post editor**: a Where it goes card. Facebook's Page (as before), then LinkedIn's profile and Pages as
  tick boxes, and one choice for the LinkedIn wording (the post as written, or a LinkedIn version from the AI
  writer, which can be edited). Publishing or scheduling the post does the same for every ticked destination.
* **Posts list**: each post shows a chip for each destination and its state.
* **Post to…** (from the list): the same card for an approved or published post, so a post can be sent to another
  channel later, retried after a failure, or taken down.
* **Page screens** (LinkedIn Pages, ads): always say which Page or account they are showing, with a chooser when
  more than one is connected.

## Stages

1. **Built now.** Channels view, destinations (LinkedIn first), versions of the words, LinkedIn scheduling,
   the Accounts screen, the editor card, chips in the list and the Post to… dialog. Facebook stays as the post's
   main destination, using the Page chosen in the editor.
2. **Next.** Facebook becomes an ordinary destination as well. That allows a post to go to several Facebook Pages
   at once, and a post that goes to LinkedIn only. The post's overall status is then worked out from its
   destinations instead of being Facebook's status. Until then a post always has Facebook as its main destination.
3. **After.** One place to read comments and results across channels, with the same chooser; saved defaults per
   business for which channels a new post starts with.

## Known limits

* Photos go to LinkedIn as JPEG or PNG, up to 8 MB.
* LinkedIn tokens last about 60 days and cannot be renewed in the background, so connections must be renewed.
  The daily check warns administrators three days before.
* Editing an approved post does not send it back for approval; that is how posts already worked.
