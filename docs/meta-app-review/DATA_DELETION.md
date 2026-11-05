# Data deletion

## For people who use Facebook or Messenger with an organisation that uses ReplyFlow

If you have messaged an organisation's Facebook Page, or sent it an enquiry through a Facebook lead form,
you can ask for your data to be deleted:

1. Visit the Facebook data settings, or send the organisation a message on its Page asking for your data to be deleted
   deleted.
2. Facebook gives you a confirmation code and a status link.
3. The messages and contact details held for you are removed within 30 days, and the
   request is marked completed on the status link.

The status link shows the code, when the request was received, and whether it is complete.

## For staff: working the queue

Requests arrive in the `data_deletion_requests` table with status `received`.

1. In the Supabase SQL editor, list open requests:
   ```sql
   select code, meta_user_id, requested_at from data_deletion_requests
   where status = 'received' order by requested_at;
   ```
2. Find the person. Facebook gives us an app-scoped user id, which is not the same as the
   Messenger id we store per Page. Match them by name or by their Messenger conversation in
   the Inbox, and confirm with the request's details before deleting anything.
3. Remove their contact details, Messenger messages, page comments, lead answers and internal
   notes. Keep the orders and payments, which the business must retain for accounting.
4. Mark the request complete:
   ```sql
   update data_deletion_requests set status = 'completed', completed_at = now()
   where code = 'THE_CODE';
   ```
5. Complete each request within 30 days, as the status page says.
