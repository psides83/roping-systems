do $$
declare definition text;
begin
  select pg_get_functiondef('public.get_event_template_reviews(uuid)'::regprocedure) into definition;
  definition := replace(definition, '(current_settings->''format'' - ''description'')', '((current_settings->''format'') - ''description'')');
  definition := replace(definition, '(template_settings->''format'' - ''description'')', '((template_settings->''format'') - ''description'')');
  execute definition;
end;
$$;
