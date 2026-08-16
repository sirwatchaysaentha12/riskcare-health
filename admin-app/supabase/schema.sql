
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;


-- ============================================
-- Health Assessment Auth System
-- Supabase Schema: profiles, trigger, RLS, view
-- ============================================

-- 1. Create profiles table
-- Password policy is configured in Supabase Dashboard > Authentication > Password
-- (minimum 8, maximum 64). This helper keeps server-side validation messages Thai.
create or replace function public.validate_password(password text)
returns text language plpgsql immutable as $$
begin
  if password is null or password = '' then return 'กรุณากรอกรหัสผ่าน'; end if;
  if char_length(password) < 8 then return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'; end if;
  if char_length(password) > 64 then return 'รหัสผ่านต้องไม่เกิน 64 ตัวอักษร'; end if;
  if password !~ '[A-Z]' then return 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว'; end if;
  if password !~ '[a-z]' then return 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว'; end if;
  if password !~ '[0-9]' then return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว'; end if;
  return null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text,
  full_name text,
  phone text,
  region text,
  province text,
  health_risk_group text,
  has_completed_assessment boolean not null default false,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score integer not null default 0,
  risk_level text not null,
  red_flag boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.risk_assessments enable row level security;
drop policy if exists "Users manage own assessments" on public.risk_assessments;
create policy "Users manage own assessments" on public.risk_assessments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists health_risk_group text;
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists province text;
alter table public.profiles add column if not exists has_completed_assessment boolean not null default false;
update public.profiles set health_risk_group = 'low' where health_risk_group is null;
alter table public.profiles alter column health_risk_group set default 'low';
alter table public.profiles alter column health_risk_group set not null;
alter table public.profiles drop constraint if exists profiles_health_risk_group_check;
alter table public.profiles add constraint profiles_health_risk_group_check
  check (health_risk_group in ('low', 'moderate', 'high_critical'));
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username)) where username is not null;
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email)) where email is not null;
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Resolve a username or phone to an auth email before the user is signed in.
-- Only the matching email is returned; profiles itself remains protected by RLS.
create or replace function public.get_login_email(lookup_field text, lookup_value text)
returns table(email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.email
  from public.profiles p
  where (
    lookup_field = 'username' and lower(p.username) = lower(lookup_value)
  ) or (
    lookup_field = 'phone' and p.phone = lookup_value
  ) or (
    lookup_field = 'email' and lower(p.email) = lower(lookup_value)
  )
  limit 1;
$$;
revoke all on function public.get_login_email(text, text) from public;
grant execute on function public.get_login_email(text, text) to anon, authenticated;

-- Check registration duplicates against real Supabase Auth users only.
-- This prevents orphaned/stale profiles from being treated as registered accounts.
create or replace function public.is_registration_taken(lookup_field text, lookup_value text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.profiles p on p.id = u.id
    where (lookup_field = 'email' and lower(u.email) = lower(trim(lookup_value)))
       or (lookup_field = 'username' and lower(p.username) = lower(trim(lookup_value)))
       or (lookup_field = 'phone' and p.phone = trim(lookup_value))
  );
$$;
revoke all on function public.is_registration_taken(text, text) from public;
grant execute on function public.is_registration_taken(text, text) to anon, authenticated;

create or replace function public.is_username_taken(lookup_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(lookup_username))
  );
$$;
revoke all on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. RLS Policies
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Users can view their own profile
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id and role = 'user')
  with check (auth.uid() = id and role = 'user');

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Users can delete their own profile
drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- 4. Auto-create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, email, phone, full_name, avatar_url)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    lower(new.email),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if any
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Public profiles view (safe for public display)
create or replace view public.public_profiles as
  select id, full_name, avatar_url
  from public.profiles;

-- 6. Grant access to the view
grant select on public.public_profiles to anon, authenticated;

-- 7. Updated_at auto-update function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ============================================
-- Storage: Create 'avatars' bucket
-- Run this in Supabase Dashboard > Storage > New Bucket
-- Name: avatars
-- Public: true
-- File size limit: 2MB
-- Allowed MIME types: image/jpeg, image/png, image/webp
-- ============================================

-- Storage RLS for avatars bucket (run in SQL Editor)
-- Allow authenticated users to upload their own avatar
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own avatar
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own avatar
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access to avatars
create policy "Public can view avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
  
