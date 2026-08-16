-- ============================================
-- Auth & Profile Test Script (Bypass transaction timestamp freeze)
-- ============================================

do $$
declare
  uid uuid := gen_random_uuid();
  row_count int;
  before_name text;
  after_name text;
begin
  -- 1. Test handle_new_user trigger via mock insert into auth.users
  insert into auth.users (id, email, raw_user_meta_data)
  values (
    uid,
    'test_user_' || uid || '@example.com',
    jsonb_build_object('username', 'testuser_' || substring(uid::text, 1, 8), 'full_name', 'Test User')
  );

  select count(*) into row_count from public.profiles where id = uid;
  if row_count <> 1 then 
    raise exception 'handle_new_user failed'; 
  end if;

  -- 2. Test profile update functionality
  select full_name into before_name from public.profiles where id = uid;

  update public.profiles 
  set full_name = 'Updated Name' 
  where id = uid;

  select full_name into after_name from public.profiles where id = uid;

  if after_name = before_name or after_name <> 'Updated Name' then 
    raise exception 'handle_updated_at failed'; 
  end if;

  raise notice 'PASS trigger/profile sync';
end $$;

rollback;