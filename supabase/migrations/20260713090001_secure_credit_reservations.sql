-- Account-scoped generation idempotency and recoverable post-generation capture.
alter table public.credit_reservations drop constraint if exists credit_reservations_request_unique;
alter table public.credit_reservations drop constraint if exists credit_reservations_status_check;
alter table public.credit_reservations
  add constraint credit_reservations_request_account_unique unique (account_id, request_id),
  add constraint credit_reservations_status_check
    check (status in ('pending', 'capture_pending', 'captured', 'released', 'expired'));

create or replace function public.reserve_credits(
  p_account_id uuid, p_request_id text, p_amount bigint, p_feature text, p_model_id text,
  p_project_id text, p_price_snapshot jsonb default '{}'::jsonb, p_cost_snapshot jsonb default '{}'::jsonb,
  p_estimated_margin_credits bigint default null, p_estimated_margin_percent numeric default null,
  p_metadata jsonb default '{}'::jsonb, p_expires_at timestamptz default null
) returns public.credit_reservations language plpgsql security definer set search_path = public, private as $$
declare v_account public.credit_accounts; v_reservation public.credit_reservations;
begin
  if p_account_id is null or length(trim(coalesce(p_request_id, ''))) = 0 then raise exception 'account_id and request_id are required'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select * into v_reservation from public.credit_reservations
    where account_id = p_account_id and request_id = p_request_id for update;
  if found then
    if v_reservation.reserved_credits <> p_amount or v_reservation.feature <> p_feature
       or v_reservation.model_id <> p_model_id or v_reservation.project_id is distinct from p_project_id
       or v_reservation.price_snapshot <> coalesce(p_price_snapshot, '{}'::jsonb) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    if v_reservation.status in ('captured', 'capture_pending') then raise exception 'GENERATION_ALREADY_COMPLETED'; end if;
    raise exception 'GENERATION_ALREADY_RUNNING';
  end if;
  select * into v_account from public.credit_accounts where account_id = p_account_id for update;
  if not found then raise exception 'credit account not found'; end if;
  if v_account.available_credits < p_amount then raise exception 'insufficient credits'; end if;
  update public.credit_accounts set available_credits = available_credits - p_amount,
    reserved_credits = reserved_credits + p_amount where account_id = p_account_id returning * into v_account;
  insert into public.credit_reservations(account_id,user_id,reserved_credits,feature,model_id,project_id,request_id,
    price_snapshot,cost_snapshot,estimated_margin_credits,estimated_margin_percent,metadata,expires_at)
  values(p_account_id,v_account.user_id,p_amount,p_feature,p_model_id,p_project_id,p_request_id,
    coalesce(p_price_snapshot,'{}'::jsonb),coalesce(p_cost_snapshot,'{}'::jsonb),p_estimated_margin_credits,
    p_estimated_margin_percent,coalesce(p_metadata,'{}'::jsonb),coalesce(p_expires_at,now()+interval '45 minutes'))
  returning * into v_reservation;
  insert into public.credit_ledger_entries(account_id,user_id,entry_type,amount_credits,available_delta_credits,
    reserved_delta_credits,available_balance_after,reserved_balance_after,total_balance_after,related_reservation_id,
    related_generation_id,idempotency_key,metadata)
  values(p_account_id,v_account.user_id,'reservation_created',0,-p_amount,p_amount,v_account.available_credits,
    v_account.reserved_credits,v_account.available_credits+v_account.reserved_credits,v_reservation.id,p_request_id,
    'reserve:'||p_account_id::text||':'||p_request_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'priceSnapshot',coalesce(p_price_snapshot,'{}'::jsonb),'costSnapshot',coalesce(p_cost_snapshot,'{}'::jsonb),
      'estimatedMarginCredits',p_estimated_margin_credits,'estimatedMarginPercent',p_estimated_margin_percent));
  return v_reservation;
end; $$;

create or replace function public.mark_credit_reservation_capture_pending(
  p_reservation_id uuid, p_result_ref text, p_metadata jsonb default '{}'::jsonb
) returns public.credit_reservations language plpgsql security definer set search_path = public, private as $$
declare v_reservation public.credit_reservations;
begin
  update public.credit_reservations set status='capture_pending', result_ref=p_result_ref,
    metadata=metadata||coalesce(p_metadata,'{}'::jsonb), expires_at=greatest(expires_at,now()+interval '7 days')
  where id=p_reservation_id and status in ('pending','capture_pending') returning * into v_reservation;
  if not found then select * into v_reservation from public.credit_reservations where id=p_reservation_id; end if;
  if not found then raise exception 'credit reservation not found'; end if;
  return v_reservation;
end; $$;

create or replace function public.capture_credit_reservation(
  p_reservation_id uuid, p_result_ref text default null, p_metadata jsonb default '{}'::jsonb
) returns public.credit_reservations language plpgsql security definer set search_path = public, private as $$
declare v_account public.credit_accounts; v_reservation public.credit_reservations; v_amount bigint;
begin
  select * into v_reservation from public.credit_reservations where id=p_reservation_id for update;
  if not found then raise exception 'credit reservation not found'; end if;
  if v_reservation.status not in ('pending','capture_pending') then return v_reservation; end if;
  v_amount:=v_reservation.reserved_credits;
  select * into v_account from public.credit_accounts where account_id=v_reservation.account_id for update;
  update public.credit_accounts set reserved_credits=reserved_credits-v_amount,
    lifetime_spent_credits=lifetime_spent_credits+v_amount where account_id=v_reservation.account_id returning * into v_account;
  update public.credit_reservations set status='captured',captured_credits=v_amount,
    result_ref=coalesce(p_result_ref,result_ref),metadata=metadata||coalesce(p_metadata,'{}'::jsonb)
    where id=v_reservation.id returning * into v_reservation;
  insert into public.credit_ledger_entries(account_id,user_id,entry_type,amount_credits,available_delta_credits,
    reserved_delta_credits,available_balance_after,reserved_balance_after,total_balance_after,related_reservation_id,
    related_generation_id,idempotency_key,metadata)
  values(v_reservation.account_id,v_reservation.user_id,'reservation_captured',-v_amount,0,-v_amount,
    v_account.available_credits,v_account.reserved_credits,v_account.available_credits+v_account.reserved_credits,
    v_reservation.id,v_reservation.request_id,'capture:'||v_reservation.id::text,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('resultRef',coalesce(p_result_ref,v_reservation.result_ref)))
  on conflict(idempotency_key) do nothing;
  return v_reservation;
end; $$;

revoke all on function public.mark_credit_reservation_capture_pending(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_credit_reservation_capture_pending(uuid,text,jsonb) to service_role;
