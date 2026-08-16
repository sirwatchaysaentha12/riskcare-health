import { createAdminClient, createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { email: identifier, password, adminCode } = await request.json();

    if (!identifier || !password || !adminCode) {
      return NextResponse.json(
        { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' },
        { status: 400 }
      );
    }

    // 1. Verify Admin Access Code against environment variable (SERVER-ONLY)
    const expectedCode = process.env.ADMIN_ACCESS_CODE;
    if (!expectedCode) {
      return NextResponse.json(
        { success: false, message: 'ยังไม่ได้ตั้งค่า ADMIN_ACCESS_CODE ใน Server' },
        { status: 500 }
      );
    }

    if (adminCode !== expectedCode) {
      return NextResponse.json(
        { success: false, message: 'รหัส Admin Access Code ไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // Resolve username to the Auth email before password verification.
    const adminSupabase = await createAdminClient();
    let email = String(identifier).trim().toLowerCase();
    if (!email.includes('@')) {
      const { data: profile } = await adminSupabase.from('profiles').select('email').eq('username', email).maybeSingle();
      if (!profile?.email) return NextResponse.json({ success: false, message: 'ไม่พบชื่อผู้ใช้ กรุณาสมัครสมาชิกก่อน' }, { status: 401 });
      email = profile.email;
    }

    // 2. Sign in with email and password via regular Supabase server client
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 }
      );
    }

    // 3. Verify user's role in profiles using Service Role client
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน' },
        { status: 404 }
      );
    }

    if (profile.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: 'บัญชีนี้ไม่มีสิทธิ์การใช้งานระดับ Admin' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ยืนยันตัวตนสำเร็จ',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: profile.role,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' },
      { status: 500 }
    );
  }
}
