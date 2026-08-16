// กฎตรวจสอบข้อมูลฟอร์ม (ข้อความภาษาไทยและ UTF-8)
export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'กรุณากรอกอีเมล';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'กรุณากรอกอีเมลให้ถูกต้อง';
  return null;
}

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return 'กรุณากรอกชื่อผู้ใช้หรืออีเมล';
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(value)) return 'ชื่อผู้ใช้ต้องมี 3–30 ตัว และใช้ a-z, 0-9, _ หรือ . เท่านั้น';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'กรุณากรอกรหัสผ่าน';
  if (password.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  if (password.length > 64) return 'รหัสผ่านต้องไม่เกิน 64 ตัวอักษร';
  if (!/[A-Z]/.test(password)) return 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว';
  if (!/[a-z]/.test(password)) return 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว';
  if (!/[0-9]/.test(password)) return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';
  return null;
}

export function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) return 'กรุณายืนยันรหัสผ่าน';
  return password === confirmPassword ? null : 'รหัสผ่านไม่ตรงกัน';
}

export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return 'กรุณากรอกเบอร์โทรศัพท์';
  return /^0\d{8,9}$/.test(phone.replace(/[-\s]/g, '')) ? null : 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง เช่น 0812345678';
}

export function validateFullName(name: string): string | null {
  if (!name.trim()) return 'กรุณากรอกชื่อ-นามสกุล';
  return name.trim().length < 2 ? 'ชื่อ-นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร' : null;
}

export function validateAdminCode(code: string): string | null {
  return code.trim() ? null : 'กรุณากรอกรหัสผู้ดูแลระบบ';
}
