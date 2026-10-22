-- Outbound Messenger replies sent from ReplyFlow are stored next to inbound messages.

alter table public.messenger_messages
    add column direction text not null default 'inbound'
        check (direction in ('inbound', 'outbound')),
    add column sent_by bigint references public.sales (id) on delete set null;

create index messenger_messages_inbound_idx
    on public.messenger_messages (contact_id, sent_at desc) where direction = 'inbound';
