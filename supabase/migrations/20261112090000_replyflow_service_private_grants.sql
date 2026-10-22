-- The server side (service role) runs triggers that call the private schema, such as
-- the audit trigger and the creator trigger. It needs to reach that schema.
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;
