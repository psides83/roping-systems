create function public.submit_membership_renewal(target_form_id uuid, target_membership_id uuid,
  application_responses jsonb, accepted_release boolean, entered_signature_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare application uuid;
begin
  perform public.membership_application_prefill(target_membership_id,target_form_id);
  application:=public.submit_membership_application(target_form_id,application_responses,accepted_release,entered_signature_name);
  update public.membership_applications set membership_id=target_membership_id,application_kind='renewal' where id=application;
  return application;
end;
$$;
revoke all on function public.submit_membership_renewal(uuid,uuid,jsonb,boolean,text) from public,anon;
grant execute on function public.submit_membership_renewal(uuid,uuid,jsonb,boolean,text) to authenticated;
