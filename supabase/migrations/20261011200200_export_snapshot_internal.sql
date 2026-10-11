-- Only the audited export-request function may read the raw snapshot.
revoke all on function public.platform_producer_export_snapshot(uuid) from public,anon,authenticated;
