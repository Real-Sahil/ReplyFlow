# ReplyFlow

Customer conversations, follow-ups and order updates for a small business, in one place.

Every enquiry has an owner. Every customer has a history. Every open opportunity has a next action.

**Status:** Phase 1 (foundation) in progress. In-house deployment for Mere & Rowe first. The name is provisional.

## Origin

ReplyFlow is built on [Atomic CRM](https://github.com/marmelab/atomic-crm) by Marmelab (MIT licence). See `NOTICE.md` and `LICENSE.md`. Upstream history is kept so fixes can be merged with `git merge upstream/main`.

## Stack

React (Vite) single-page app, Supabase (Postgres, Auth, Edge Functions), hosted on Vercel.

## Deliberately not carried over from upstream

Upstream's `.claude/` agent hooks, CI workflows, devcontainer, and its `mcp` edge function are not part of ReplyFlow. They run code or grant database access we have not reviewed.
