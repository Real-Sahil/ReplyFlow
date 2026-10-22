-- Customer order page: an unguessable link per order, a traffic light per stage that
-- staff set, and a short update written for the customer to read.

create function public.valid_stage_lights(lights jsonb) returns boolean
    language sql immutable
    set search_path = ''
    as $$
    select jsonb_typeof(lights) = 'object'
       and not exists (
           select 1 from jsonb_each_text(lights) e
           where e.key not in (
                   'confirmed', 'deposit_paid', 'in_production', 'ready_for_delivery',
                   'delivery_booked', 'delivered', 'completed'
               )
              or e.value not in ('green', 'amber', 'red')
       );
$$;

alter table public.orders
    add column tracking_token uuid not null default gen_random_uuid() unique,
    add column stage_lights jsonb not null default '{}'::jsonb,
    add column customer_update text,
    add column customer_update_at timestamptz;

alter table public.orders
    add constraint orders_stage_lights_valid check (public.valid_stage_lights(stage_lights));
