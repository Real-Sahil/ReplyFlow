# Data deletion

## For people who use Facebook or Messenger with Mere & Row

If you have messaged our Facebook Page, or sent us an enquiry through a Facebook lead form,
you can ask us to delete your data:

1. Visit the Facebook data settings, or send us a message on our Page asking us to delete
   your data.
2. Facebook gives you a confirmation code and a status link.
3. We remove the messages and contact details we hold for you, within 30 days, and mark the
   request completed on the status link.

The status link shows the code, when we received the request, and whether it is complete.

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
