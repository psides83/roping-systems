-- Preserve full before/after values as well as the high-level staff action.
do $$ declare t text; begin
  foreach t in array array['event_stock_settings','event_stock_packages','event_stock_sessions','event_stock_purchases','event_stock_payments','event_stock_uses'] loop
    execute format('create trigger stock_change_history after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t);
  end loop;
end $$;
