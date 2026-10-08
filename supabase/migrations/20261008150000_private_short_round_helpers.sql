-- These are implementation helpers, not staff-facing workflows. Authorized
-- SECURITY DEFINER event workflows still invoke them as their function owner.
revoke all on function public.apply_short_round_settings(uuid,uuid,boolean,jsonb),
  public.apply_template_short_round_settings(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';
