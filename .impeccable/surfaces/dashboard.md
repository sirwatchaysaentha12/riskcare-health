# Dashboard Surface

- Route: `/dashboard`
- Purpose: ภาพรวมสถานการณ์ฝุ่น PM2.5
- Content: การ์ดรายภาค, ค่า AQI, Top 3 จังหวัด และคำแนะนำสุขภาพ
- Data: Air4Thai/DustBoy ผ่าน stations gateway
- States: loading, API error, fallback station data, normal/sensitive user group
- Navigation: มีลิงก์กลับหน้าหลัก และเมนูภาพรวมอยู่กึ่งกลางบน Navbar
