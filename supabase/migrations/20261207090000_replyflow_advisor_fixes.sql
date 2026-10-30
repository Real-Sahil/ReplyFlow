-- Performance advisor fixes.
--
-- 1. Index the foreign keys that had no covering index (joins and deletes on them
--    scan the whole table otherwise). meta_circuit and meta_connection hold one row,
--    so they are left out.
-- 2. custom_field_definitions and stage_task_rules had one FOR ALL write policy next to
--    a SELECT policy, so every read ran two policies, and auth.uid() was evaluated per
--    row. The write policy is split into insert, update and delete, and auth.uid() is
--    wrapped in a select so it is evaluated once per query. Who can do what is unchanged:
--    administrators write within their own organisation, staff read.

create index if not exists after_sales_issues_sales_id_idx on public.after_sales_issues (sales_id);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
create index if not exists companies_sales_id_idx on public.companies (sales_id);
create index if not exists contact_notes_sales_id_idx on public.contact_notes (sales_id);
create index if not exists contacts_sales_id_idx on public.contacts (sales_id);
create index if not exists deal_notes_sales_id_idx on public.deal_notes (sales_id);
create index if not exists deals_sales_id_idx on public.deals (sales_id);
create index if not exists messenger_internal_notes_sales_id_idx on public.messenger_internal_notes (sales_id);
create index if not exists messenger_messages_deal_id_idx on public.messenger_messages (deal_id);
create index if not exists messenger_messages_sent_by_idx on public.messenger_messages (sent_by);
create index if not exists meta_leadgen_leads_deal_id_idx on public.meta_leadgen_leads (deal_id);
create index if not exists order_payments_sales_id_idx on public.order_payments (sales_id);
create index if not exists order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index if not exists orders_sales_id_idx on public.orders (sales_id);
create index if not exists page_comments_contact_id_idx on public.page_comments (contact_id);
create index if not exists page_comments_replied_by_idx on public.page_comments (replied_by);
create index if not exists page_posts_approved_by_idx on public.page_posts (approved_by);
create index if not exists page_posts_created_by_idx on public.page_posts (created_by);
create index if not exists page_posts_product_id_idx on public.page_posts (product_id);
create index if not exists page_posts_recycled_from_idx on public.page_posts (recycled_from);
create index if not exists post_autopilot_settings_updated_by_idx on public.post_autopilot_settings (updated_by);
create index if not exists quotes_sales_id_idx on public.quotes (sales_id);
create index if not exists sales_organisation_id_idx on public.sales (organisation_id);
create index if not exists saved_replies_created_by_idx on public.saved_replies (created_by);
create index if not exists signup_grants_organisation_id_idx on public.signup_grants (organisation_id);
create index if not exists tasks_contact_id_idx on public.tasks (contact_id);
create index if not exists tracked_links_created_by_idx on public.tracked_links (created_by);
create index if not exists tracked_links_product_id_idx on public.tracked_links (product_id);

-- custom_field_definitions
drop policy "administrators write" on public.custom_field_definitions;

create policy "administrators insert" on public.custom_field_definitions
  for insert to authenticated
  with check (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );
create policy "administrators update" on public.custom_field_definitions
  for update to authenticated
  using (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  )
  with check (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );
create policy "administrators delete" on public.custom_field_definitions
  for delete to authenticated
  using (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );

-- stage_task_rules
drop policy "administrators write" on public.stage_task_rules;

create policy "administrators insert" on public.stage_task_rules
  for insert to authenticated
  with check (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );
create policy "administrators update" on public.stage_task_rules
  for update to authenticated
  using (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  )
  with check (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );
create policy "administrators delete" on public.stage_task_rules
  for delete to authenticated
  using (
    exists (select 1 from public.sales s where s.user_id = (select auth.uid()) and s.administrator = true)
    and organisation_id = (select private.current_organisation())
  );
