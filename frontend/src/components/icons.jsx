// Inline SVG icon set สำหรับ shell ใหม่ (แทน Material Symbols จาก Google Fonts
// เพื่อไม่พึ่งเน็ตภายนอก — โปรเจกต์เดิมก็ใช้ inline SVG ใน SidebarNav.jsx เช่นเดียวกัน)
// รูปทรงอิงชื่อไอคอนใน stitch-design/code.html (menu, home, grid_view, ...)

const PATHS = {
  menu: <><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" /></>,
  close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></>,
  grid_view: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  trending_up: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  monitor_heart: <><path d="M12 5c-1.5-2-5-2.5-6.5 0S4 11 6 13s5 3.5 6 6c1-2.5 4-4 6-6s2-5.5.5-8S13.5 3 12 5Z" /></>,
  videocam: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  checklist: <><path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  assignment: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 10h6M9 14h6M9 18h3" /></>,
  vital_signs: <><path d="M3 12h4l2-5 4 10 2-5h6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" /></>,
  manage_accounts: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3.1-5.5 7-5.5" /><path d="M16.5 15.5v6M13.5 18.5h6" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  notifications: <><path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></>,
  location_city: <><rect x="4" y="8" width="6" height="12" /><rect x="10" y="4" width="7" height="16" /><path d="M13 8h1M13 12h1M13 16h1M6.5 12h1M6.5 16h1" /></>,
  explore: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  sync: <><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></>,
  air: <><path d="M4 8h9a3 3 0 1 0-3-3" /><path d="M3 12h13a3 3 0 1 1-3 3" /><path d="M5 16h6a2.5 2.5 0 1 1-2.5 2.5" /></>,
  analytics: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 16v-5M12 16V8M16 16v-3" /></>,
  format_list_numbered: <><path d="M10 6h11M10 12h11M10 18h11" /><path d="M4 5.5 5.5 5V10M3.8 15.5c.2-1.7 3.2-1.5 3.2.2 0 1-3 2.3-3.2 3.3h3.4" /></>,
  health_and_safety: <><path d="M12 3 4 6v6c0 4.5 3.4 7.7 8 9 4.6-1.3 8-4.5 8-9V6l-8-3Z" /><path d="M12 8v4M10 10h4" /></>,
  warning: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17.2v.1" /></>,
  error: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.2v.1" /></>,
  cloud_off: <><path d="m3 3 18 18" /><path d="M7 18a4.5 4.5 0 0 1-.7-8.9A6 6 0 0 1 17.5 8.6 4.2 4.2 0 0 1 19 16.5" /><path d="M7 18h9" /></>,
  lungs: <><path d="M12 4c-.8 2.5-.8 4.5 0 7" /><path d="M12 11c-1-3.5-4-4.3-6.2-2.6C3.6 10.2 3 13.5 3.5 17c.3 2 2.4 2.6 4 1.6 1.7-1.1 3-2.7 4.5-4.6" /><path d="M12 11c1-3.5 4-4.3 6.2-2.6 2.2 1.8 2.8 5.1 2.3 8.6-.3 2-2.4 2.6-4 1.6-1.7-1.1-3-2.7-4.5-4.6" /></>,
  thermostat: <><path d="M10 5a2 2 0 1 1 4 0v8.5a4.5 4.5 0 1 1-4 0V5Z" /><path d="M12 12v4" /></>,
  droplet: <path d="M12 3s6 6.3 6 10.5a6 6 0 0 1-12 0C6 9.3 12 3 12 3Z" />,
  wind: <><path d="M4 8h9a3 3 0 1 0-3-3" /><path d="M3 13h15a3 3 0 1 1-3 3" /><path d="M5 18h5" /></>,
}

export default function Icon({ name, size = 20, className = '', filled = false }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  )
}
