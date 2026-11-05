-- Markets and currencies.
--
-- An administrator chooses a business's market (a country) and currency in Settings. Both are kept in that
-- business's configuration (configuration.config), which every sign-in of the business can read, so everyone
-- sees amounts the same way. Amounts are stored in the smallest unit and divided by 100, so only currencies
-- with two decimal places are allowed.
--
-- Tax: invoices, bills and the VAT return are built for UK VAT only. In any other market a business is never
-- treated as VAT registered, so issue_invoice() issues invoices without tax lines. This is enforced here, in
-- the database, and not only on the Settings screen.

create or replace function private.configuration_market_check() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_currency text := new.config ->> 'currency';
  v_market text := new.config ->> 'market';
begin
  if v_currency is not null and v_currency not in (
    'GBP','EUR','USD','CAD','AUD','NZD','CHF','SEK','NOK','DKK','PLN','CZK','ZAR','INR','AED','SGD','HKD','MXN'
  ) then
    raise exception 'That currency is not supported. Amounts need a currency with two decimal places.';
  end if;
  if v_market is not null and v_market not in (
    'GB','IE','US','CA','AU','NZ','DE','FR','NL','ES','IT','AE','ZA','IN','SG'
  ) then
    raise exception 'That market is not supported.';
  end if;
  return new;
end;
$$;
revoke execute on function private.configuration_market_check() from public, anon, authenticated;
create trigger "20_configuration_market_check" before insert or update on public.configuration
  for each row execute function private.configuration_market_check();

-- Outside the United Kingdom a business is not VAT registered.
create or replace function private.business_settings_market_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_market text;
begin
  select c.config ->> 'market' into v_market
    from public.configuration c where c.organisation_id = new.organisation_id;
  if v_market is not null and v_market <> 'GB' then
    new.vat_registered := false;
    new.vat_number := null;
    new.vat_scheme := 'standard';
    new.flat_rate_percent := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.business_settings_market_guard() from public, anon, authenticated;
create trigger "20_business_settings_market_guard" before insert or update on public.business_settings
  for each row execute function private.business_settings_market_guard();

-- Moving a business to another market switches VAT off straight away.
create or replace function private.configuration_market_changed() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  if (new.config ->> 'market') is distinct from (old.config ->> 'market')
     and coalesce(new.config ->> 'market', 'GB') <> 'GB' then
    update public.business_settings
       set vat_registered = false, vat_number = null, vat_scheme = 'standard', flat_rate_percent = null
     where organisation_id = new.organisation_id and vat_registered;
  end if;
  return null;
end;
$$;
revoke execute on function private.configuration_market_changed() from public, anon, authenticated;
create trigger "80_configuration_market_changed" after update on public.configuration
  for each row execute function private.configuration_market_changed();
