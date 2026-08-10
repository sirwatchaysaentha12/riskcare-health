import reactLogo from '../assets/react.svg'
import viteLogo from '../assets/vite.svg'
import heroImg from '../assets/hero.png'
import Header from '../components/Header'

function Home() {
  return (
    <>
      <Header />
      <main>
        <section id="center">
          <div className="hero">
            <img src={heroImg} className="base" width="170" height="179" alt="" />
            <img src={reactLogo} className="framework" alt="โลโก้ React" />
            <img src={viteLogo} className="vite" alt="โลโก้ Vite" />
          </div>
          <div>
            <h1>React Starter</h1>
            <p>โครงสร้างโปรเจกต์พร้อมเริ่มพัฒนาต่อ</p>
          </div>
        </section>

        <div className="ticks" />

        <section id="next-steps">
          <div id="about">
            <h2>โครงสร้างพร้อมใช้</h2>
            <p>แยกส่วนประกอบ หน้าเว็บ และไฟล์ assets ให้เป็นระเบียบ</p>
          </div>
          <div id="resources">
            <h2>แหล่งเรียนรู้</h2>
            <ul>
              <li>
                <a href="https://vite.dev/" target="_blank" rel="noreferrer">
                  <img className="logo" src={viteLogo} alt="" />
                  Vite
                </a>
              </li>
              <li>
                <a href="https://react.dev/" target="_blank" rel="noreferrer">
                  <img className="button-icon" src={reactLogo} alt="" />
                  React
                </a>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </>
  )
}

export default Home