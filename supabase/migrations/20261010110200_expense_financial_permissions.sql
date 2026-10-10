-- Expense mutations use the same financial role boundary as the report and RLS.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_event_expense(uuid,uuid,integer,uuid,text,bigint,text,boolean)'::regprocedure) into definition;
  definition:=replace(definition,'public.can_adjust_event_finances(target_event)','public.can_finance_event(target_event)');
  execute definition;
end $$;
