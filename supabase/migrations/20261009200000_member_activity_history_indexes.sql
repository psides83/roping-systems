-- Member timelines search both snapshots so transfers and deleted entries remain visible.
create index producer_audit_entry_roper_before_idx
  on public.producer_audit_log (producer_id, (before_data->>'roper_id'))
  where entity_type = 'roping_entries' and action <> 'insert';

create index producer_audit_entry_roper_after_idx
  on public.producer_audit_log (producer_id, (after_data->>'roper_id'))
  where entity_type = 'roping_entries' and action <> 'insert';
