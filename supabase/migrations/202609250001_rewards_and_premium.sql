-- Server-owned rewards. A UTC calendar day has one free draw per member.
alter table public.wallets
  add column pigeon_passes integer not null default 0 check (pigeon_passes >= 0),
  add column postman_passes integer not null default 0 check (postman_passes >= 0),
  add column riddle_tokens integer not null default 0 check (riddle_tokens >= 0);
alter table public.points_ledger drop constraint points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('welcome','postage','daily_reward','riddle','reward_postage','premium_allowance'));

create table public.daily_rewards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_day date not null,
  kind text not null check (kind in ('pigeon','postman','points','riddle')),
  amount integer not null check (amount > 0),
  primary key(user_id, reward_day)
);
create table private.riddles (
  id integer primary key,
  question text not null,
  answers text[] not null
);
insert into private.riddles values
 (1, 'What has keys but cannot open a door?', array['piano','a piano']),
 (2, 'What gets wetter the more it dries?', array['towel','a towel']),
 (3, 'What has hands but cannot clap?', array['clock','a clock']),
 (4, 'What has a neck but no head?', array['bottle','a bottle']),
 (5, 'What has many teeth but cannot bite?', array['comb','a comb']),
 (6, 'What can travel around the world while staying in a corner?', array['stamp','a stamp','postage stamp','a postage stamp']),
 (7, 'What has one eye but cannot see?', array['needle','a needle']),
 (8, 'What has words but never speaks?', array['book','a book']);
create table public.riddle_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  question text not null,
  attempts integer not null default 0 check (attempts between 0 and 3),
  solved boolean not null default false,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique(user_id, client_id)
);
create table private.riddle_solutions (
  round_id uuid primary key references public.riddle_rounds(id) on delete cascade,
  riddle_id integer not null references private.riddles(id)
);
create table public.premium_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  product_id text not null,
  checked_at timestamptz not null default now()
);
create table private.premium_allowances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start timestamptz not null,
  primary key(user_id, period_start)
);
alter table public.daily_rewards enable row level security;
alter table public.riddle_rounds enable row level security;
alter table public.premium_memberships enable row level security;
create policy reward_owner on public.daily_rewards for select to authenticated using(user_id = auth.uid());
create policy riddle_owner on public.riddle_rounds for select to authenticated using(user_id = auth.uid());
create policy premium_owner on public.premium_memberships for select to authenticated using(user_id = auth.uid());
revoke all on public.daily_rewards, public.riddle_rounds, public.premium_memberships from public, anon, authenticated;
revoke all on private.riddles, private.riddle_solutions, private.premium_allowances from public, anon, authenticated;
grant select on public.daily_rewards, public.riddle_rounds, public.premium_memberships to authenticated;

create function private.is_premium(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.premium_memberships where user_id = p_user and expires_at > now())
$$;
revoke all on function private.is_premium(uuid) from public, anon, authenticated;

create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('profile', to_jsonb(p), 'birthday', b.birthday, 'points', w.points,
    'rewards', jsonb_build_object('pigeon', w.pigeon_passes, 'postman', w.postman_passes, 'riddle', w.riddle_tokens,
      'today', (select to_jsonb(d) - 'user_id' from public.daily_rewards d where d.user_id = p.id and d.reward_day = (now() at time zone 'UTC')::date),
      'next_claim_at', (((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC'),
      'round', (select to_jsonb(r) - 'user_id' - 'client_id' from public.riddle_rounds r where r.user_id = p.id and not r.solved and r.attempts < 3 and r.expires_at > now() order by r.created_at desc limit 1)),
    'premium', private.is_premium(p.id),
    'premium_expires_at', (select expires_at from public.premium_memberships where user_id = p.id))
  from public.profiles p join private.birthdays b on b.user_id = p.id join public.wallets w on w.user_id = p.id
  where p.id = auth.uid()
$$;

create function public.claim_daily_reward() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); d date := (now() at time zone 'UTC')::date; reward public.daily_rewards; k text;
begin
  perform 1 from public.wallets where user_id = u for update;
  select * into reward from public.daily_rewards where user_id = u and reward_day = d;
  if found then return to_jsonb(reward) - 'user_id'; end if;
  k := (array['pigeon','postman','points','riddle'])[1 + floor(random() * 4)::int];
  insert into public.daily_rewards values(u, d, k, case when k = 'points' then 10 else 1 end) returning * into reward;
  update public.wallets set points = points + case when k = 'points' then 10 else 0 end,
    pigeon_passes = pigeon_passes + case when k = 'pigeon' then 1 else 0 end,
    postman_passes = postman_passes + case when k = 'postman' then 1 else 0 end,
    riddle_tokens = riddle_tokens + case when k = 'riddle' then 1 else 0 end where user_id = u;
  if k = 'points' then insert into public.points_ledger(user_id, delta, reason) values(u, 10, 'daily_reward'); end if;
  return to_jsonb(reward) - 'user_id';
end $$;

create function public.start_riddle(p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); r public.riddle_rounds; puzzle private.riddles;
begin
  if p_client_id is null then raise exception 'A request ID is required.'; end if;
  perform 1 from public.wallets where user_id = u for update;
  select * into r from public.riddle_rounds where user_id = u and client_id = p_client_id;
  if found then return to_jsonb(r); end if;
  select * into r from public.riddle_rounds where user_id = u and not solved and attempts < 3 and expires_at > now() order by created_at desc limit 1;
  if found then return to_jsonb(r); end if;
  if (select riddle_tokens from public.wallets where user_id = u) < 1 then raise exception 'You need a riddle token.'; end if;
  select * into puzzle from private.riddles order by random() limit 1;
  update public.wallets set riddle_tokens = riddle_tokens - 1 where user_id = u;
  insert into public.riddle_rounds(user_id, client_id, question) values(u, p_client_id, puzzle.question) returning * into r;
  insert into private.riddle_solutions values(r.id, puzzle.id);
  return to_jsonb(r);
end $$;

-- Remember answers so a transport retry does not consume another attempt.
create table private.riddle_answers (
  round_id uuid references public.riddle_rounds(id) on delete cascade,
  answer text not null,
  primary key(round_id, answer)
);
revoke all on private.riddle_answers from public, anon, authenticated;
create function public.answer_riddle(p_round uuid, p_answer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); r public.riddle_rounds; v_answer text; correct boolean;
begin
  v_answer := lower(trim(regexp_replace(coalesce(p_answer, ''), '[[:space:]]+', ' ', 'g')));
  if char_length(v_answer) not between 1 and 80 then raise exception 'Enter a short answer (1–80 characters).'; end if;
  perform 1 from public.wallets where user_id = u for update;
  select * into r from public.riddle_rounds where id = p_round and user_id = u for update;
  if not found then raise exception 'Riddle unavailable.'; end if;
  if r.solved or exists(select 1 from private.riddle_answers where round_id = r.id and private.riddle_answers.answer = v_answer) then return to_jsonb(r); end if;
  if r.attempts >= 3 or r.expires_at <= now() then raise exception 'This riddle has ended.'; end if;
  select v_answer = any(q.answers) into correct from private.riddles q join private.riddle_solutions s on s.riddle_id = q.id where s.round_id = r.id;
  insert into private.riddle_answers values(r.id, v_answer);
  update public.riddle_rounds set attempts = attempts + 1, solved = correct where id = r.id returning * into r;
  if correct then
    update public.wallets set points = points + 20 where user_id = u;
    insert into public.points_ledger(user_id, delta, reason) values(u, 20, 'riddle');
  end if;
  return to_jsonb(r);
end $$;

-- Only the verified billing Edge Function may call this API.
create function public.apply_premium_status(p_user uuid, p_expires_at timestamptz, p_period_start timestamptz, p_product_id text, p_observed_at timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.wallets where user_id = p_user for update;
  if not found then raise exception 'Create a passport before purchasing.'; end if;
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
revoke all on function public.claim_daily_reward(), public.start_riddle(uuid), public.answer_riddle(uuid,text), public.apply_premium_status(uuid,timestamptz,timestamptz,text,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_daily_reward(), public.start_riddle(uuid), public.answer_riddle(uuid,text) to authenticated;
grant execute on function public.apply_premium_status(uuid,timestamptz,timestamptz,text,timestamptz) to service_role;

create or replace function public.send_letter(p_body text, p_courier text, p_client_id uuid, p_target_kind text default 'anywhere', p_target_country text default null, p_target_person uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := private.require_member(); recipient uuid; letter public.letters; balance integer; passes integer; premium boolean; delay interval;
begin
  if p_client_id is null then raise exception 'A request ID is required.'; end if;
  -- A wallet lock serializes sends from one account: double taps cannot overspend.
  select points into balance from public.wallets where user_id = u for update;
  select * into letter from public.letters where sender_id = u and client_id = p_client_id;
  if found then
    if letter.body is distinct from trim(p_body) or letter.courier is distinct from p_courier or letter.target_kind is distinct from p_target_kind
      or letter.target_country is distinct from p_target_country or letter.target_person_id is distinct from p_target_person then raise exception 'Request ID was already used for another letter.'; end if;
    return letter.id;
  end if;
  if p_body is null or char_length(trim(p_body)) not between 20 and 800 then raise exception 'Letters must contain 20–800 characters.'; end if;
  if p_courier is null or p_courier not in ('pigeon','postman') then raise exception 'Choose a valid courier.'; end if;
  if p_target_kind is null or p_target_kind not in ('anywhere','country','person')
    or (p_target_kind = 'country' and (p_target_country is null or p_target_person is not null))
    or (p_target_kind = 'person' and (p_target_person is null or p_target_country is not null))
    or (p_target_kind = 'anywhere' and (p_target_country is not null or p_target_person is not null)) then raise exception 'Choose a valid destination.'; end if;
  select case p_courier when 'pigeon' then pigeon_passes else postman_passes end into passes from public.wallets where user_id = u;
  premium := private.is_premium(u);
  if passes = 0 and balance < 10 then raise exception 'You need 10 postage points.'; end if;
  if (select count(*) from public.letters where sender_id = u and status in ('traveling','arrived') and expires_at > now()) >= (case when premium then 10 else 5 end) then raise exception 'Your active-letter limit has been reached.'; end if;
  if (select count(*) from public.letters where sender_id = u and sent_at > now() - interval '24 hours') >= (case when premium then 20 else 10 end) then raise exception 'Your daily letter limit has been reached.'; end if;
  recipient := private.choose_recipient(u, p_target_kind, p_target_country, p_target_person);
  if recipient is null then raise exception 'No available explorer in this destination and your friendship circle.'; end if;
  -- Lock the receiving profile before rechecking inbox capacity and interaction.
  perform 1 from public.profiles where id in (u, recipient) order by id for update;
  if not private.same_circle(u, recipient) or (p_target_kind = 'country' and not exists(select 1 from public.profiles where id = recipient and country = p_target_country)) then raise exception 'This explorer is no longer available.'; end if;
  if (select count(*) from public.letters where recipient_id = recipient and status in ('traveling','arrived') and expires_at > now()) >= 30 then raise exception 'This inbox is full. Please try again later.'; end if;
  delay := case p_courier when 'pigeon' then interval '15 minutes' else interval '1 hour' end;
  insert into public.letters(sender_id, recipient_id, body, courier, target_kind, target_country, target_person_id, arrives_at, client_id)
    values(u, recipient, trim(p_body), p_courier, p_target_kind, p_target_country, p_target_person, now() + delay, p_client_id) returning * into letter;
  insert into private.delivery_attempts(letter_id, recipient_id) values(letter.id, recipient);
  if passes > 0 then
    update public.wallets set pigeon_passes = pigeon_passes - case when p_courier = 'pigeon' then 1 else 0 end,
      postman_passes = postman_passes - case when p_courier = 'postman' then 1 else 0 end where user_id = u;
    insert into public.points_ledger(user_id, delta, reason, letter_id) values(u, 0, 'reward_postage', letter.id);
  else
    update public.wallets set points = points - 10 where user_id = u;
    insert into public.points_ledger(user_id, delta, reason, letter_id) values(u, -10, 'postage', letter.id);
  end if;
  return letter.id;
end $$;


notify pgrst, 'reload schema';
