import { createAdminClient, createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const { identifier, password } = await request.json();

    if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier || !password) {
      return NextResponse.json({ success: false, message: 'Invalid login credentials' }, { status: 401 });
    }

    let email = identifier.trim().toLowerCase();
    if (!emailPattern.test(email)) {
      const adminSupabase = await createAdminClient();
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('email')
        .eq('username', email)
        .maybeSingle();

      if (!profile?.email) {
        return NextResponse.json({ success: false, message: 'Invalid login credentials' }, { status: 401 });
      }
      email = profile.email;
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 401 });
    }

    const adminSupabase = await createAdminClient();
    const { data: profile } = await adminSupabase.from('profiles').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id || '').maybeSingle();
    return NextResponse.json({ success: true, role: profile?.role || null });
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid login credentials' }, { status: 401 });
  }
}
