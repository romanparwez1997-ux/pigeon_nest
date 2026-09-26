-- Reserve complimentary_lifetime for administrator-issued gifts.
-- Year 9999 is a client-compatible lifetime sentinel (PostgreSQL infinity is not a JavaScript date).
create or replace function public.apply_premium_status(p_user uuid, p_expires_at timestamptz, p_period_start timestamptz, p_product_id text, p_observed_at timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.wallets where user_id = p_user for update;
  if not found then raise exception 'Create a passport before purchasing.'; end if;
  -- Only administrators can revoke a complimentary lifetime grant directly.
  -- Store restore/webhook events must not turn a gift into an expired subscription.
  if exists(select 1 from public.premium_memberships where user_id = p_user
    and product_id = 'complimentary_lifetime' and expires_at >= '9999-01-01'::timestamptz) then return; end if;
  if exists(select 1 from public.premium_memberships where user_id = p_user and checked_at > p_observed_at) then return; end if;
  insert into public.premium_memberships(user_id, expires_at, product_id, checked_at)
    values(p_user, coalesce(p_expires_at, '1970-01-01'::timestamptz), coalesce(p_product_id, ''), p_observed_at)
    on conflict(user_id) do update set expires_at = excluded.expires_at, product_id = excluded.product_id, checked_at = excluded.checked_at;
  if p_expires_at > now() and p_period_start is not null and p_period_start <= now() then
    insert into private.premium_allowances values(p_user, p_period_start) on conflict do nothing;
    if found then
      update public.wallets set points = points + 100 where user_id = p_user;
      insert into public.points_ledger(user_id, delta, reason) values(p_user, 100, 'premium_allowance');
    end if;
  end if;
end $$;
