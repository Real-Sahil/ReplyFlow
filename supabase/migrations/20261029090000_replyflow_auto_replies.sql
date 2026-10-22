-- Rule-based Messenger auto-replies: greeting, away message and quick questions.
-- Off by default. No AI: the texts and questions are exactly what staff write here.

create table public.messenger_settings (
    id integer primary key default 1,
    auto_replies_enabled boolean not null default false,
    greeting_text text not null default 'Hi, thanks for messaging Mere & Row. We have your message and a member of the team will reply shortly.',
    away_enabled boolean not null default false,
    away_text text not null default 'We are currently closed, but we will reply as soon as we are back.',
    timezone text not null default 'Europe/London',
    -- ISO weekdays, 1 = Monday. These hours are placeholders: set your real ones.
    open_days integer[] not null default '{1,2,3,4,5}',
    open_from time not null default '09:00',
    open_to time not null default '17:30',
    qualify_enabled boolean not null default false,
    question_1 text default 'What size is the room, or how many people need to sit?',
    question_2 text default 'Do you have a colour or fabric in mind?',
    question_3 text,
    closing_text text not null default 'Thank you, that helps. A member of the team will come back to you shortly.',
    constraint messenger_settings_singleton check (id = 1),
    constraint messenger_settings_days check (open_days <@ array[1,2,3,4,5,6,7])
);
insert into public.messenger_settings (id) values (1);

-- Where each conversation is in the automatic flow.
create table public.messenger_conversation_state (
    contact_id bigint primary key references public.contacts (id) on delete cascade,
    step integer not null default 0,
    greeted_at timestamptz,
    away_sent_at timestamptz,
    done boolean not null default false,
    handoff boolean not null default false,
    answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
    updated_at timestamptz not null default now()
);

alter table public.messenger_settings enable row level security;
alter table public.messenger_conversation_state enable row level security;

create policy "staff read" on public.messenger_settings
    for select to authenticated using ((select public.staff_role()) is not null);
create policy "admins update" on public.messenger_settings
    for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "staff read" on public.messenger_conversation_state
    for select to authenticated using ((select public.staff_role()) is not null);

grant select, update on public.messenger_settings to authenticated;
grant select on public.messenger_conversation_state to authenticated;
grant all on public.messenger_settings, public.messenger_conversation_state to service_role;
