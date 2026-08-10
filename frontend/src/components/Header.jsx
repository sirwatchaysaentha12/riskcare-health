function Header() {
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="หน้าแรก">
        React Starter
      </a>
      <nav aria-label="เมนูหลัก">
        <a href="#about">เกี่ยวกับโปรเจกต์</a>
        <a href="#resources">แหล่งเรียนรู้</a>
      </nav>
    </header>
  )
}

export default Header