import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/icons'
import { RISK_DISCLAIMER } from '../utils/respiratoryRiskScore'
import '../styles/respiratory-hub.css'

const QUALITY_ITEMS = [
  'ระยะเวลาการวัด',
  'ตำแหน่งไหล่และลำตัว',
  'ความสว่างของภาพ',
  'ความคมชัดของภาพ',
  'อัตราเฟรมวิดีโอ',
  'เฟรมที่ขาดหาย',
  'การเคลื่อนไหวระหว่างวัด',
  'ความเป็นคาบของสัญญาณ',
  'ความสม่ำเสมอของรอบหายใจ',
]

const METRICS = [
  { key: 'rr', label: 'อัตราการหายใจ', unit: 'ครั้ง/นาที', icon: 'air', note: 'รอผลการตรวจจริง' },
  { key: 'hr', label: 'อัตราการเต้นของหัวใจ', unit: 'ครั้ง/นาที', icon: 'vital_signs', note: 'รอผลการตรวจจริง' },
  { key: 'spo2', label: 'ออกซิเจนในเลือด (SpO₂)', unit: '', icon: 'health_and_safety', note: 'ยังไม่รองรับในโหมดที่มีอยู่' },
]

export default function RespiratoryCheckHub() {
  const [mode, setMode] = useState('camera')
  const [notice, setNotice] = useState('')

  // TODO: เชื่อม database สำหรับผลประเมิน/ข้อความสถานะ เมื่อมี schema และแหล่งข้อมูลยืนยัน
  // TODO: เชื่อมโมเดลจริงภายหลังการกำหนด consent และ flow ประมวลผลที่ได้รับอนุมัติ
  const showModelPending = () => setNotice('ฟังก์ชันนี้รอเชื่อมต่อโมเดลจริง')

  return (
    <main className="resp-hub-page">
      <div className="resp-hub-shell">
        <header className="resp-hub-header">
          <Link className="resp-hub-brand" to="/" aria-label="AIRCHECK MD หน้าหลัก">
            <span className="resp-hub-brand-mark"><Icon name="lungs" size={24} /></span>
            <span><strong>AIRCHECK MD</strong><small>ระบบคัดกรองสัญญาณสุขภาพเบื้องต้น</small></span>
          </Link>
          <span className="resp-hub-system-status"><i aria-hidden="true" />รอข้อมูลตรวจจริง</span>
        </header>

        <section className="resp-hub-overview" aria-labelledby="resp-hub-title">
          <div className="resp-hub-overview-copy">
            <span className="resp-hub-eyebrow">การคัดกรองเบื้องต้น</span>
            <h1 id="resp-hub-title">ประเมินสุขภาพทางเดินหายใจ</h1>
            <p>ผลการตรวจจะแสดงเมื่อเชื่อมต่อและได้รับข้อมูลจริงจากระบบ</p>
          </div>
          <div className="resp-hub-score" aria-label="คะแนนความเสี่ยง รอผลการตรวจวัด">
            <div><strong>--</strong><span>/ 100</span></div>
            <span className="resp-hub-pending-badge">รอผลการตรวจวัด</span>
            <small>โหมดกล้องสด · 30 วินาที</small>
          </div>
        </section>

        <section className="resp-hub-metrics" aria-label="ตัวชี้วัดสุขภาพ">
          {METRICS.map((metric) => (
            <article className={`resp-hub-metric resp-hub-metric--${metric.key}`} key={metric.key}>
              <span className="resp-hub-metric-icon"><Icon name={metric.icon} size={20} /></span>
              <div className="resp-hub-metric-heading"><h2>{metric.label}</h2><span>{metric.note}</span></div>
              <strong className="resp-hub-metric-value">--</strong>
              {metric.unit && <small>{metric.unit}</small>}
            </article>
          ))}
        </section>

        <div className="resp-hub-workspace">
          <section className="resp-hub-capture-card" aria-labelledby="capture-title">
            <div className="resp-hub-card-heading">
              <div><span className="resp-hub-eyebrow">เริ่มต้นการตรวจ</span><h2 id="capture-title">เลือกวิธีตรวจวัด</h2></div>
              <span className="resp-hub-mode-note">รอข้อมูลจริง</span>
            </div>

            <div className="resp-hub-tabs" role="tablist" aria-label="วิธีตรวจวัด">
              <button id="resp-hub-camera-tab" type="button" role="tab" aria-controls="resp-hub-camera-panel" aria-selected={mode === 'camera'} tabIndex={mode === 'camera' ? 0 : -1} className={mode === 'camera' ? 'is-active' : ''} onClick={() => setMode('camera')}>
                <Icon name="videocam" size={18} /> ใช้กล้องสด
              </button>
              <button id="resp-hub-upload-tab" type="button" role="tab" aria-controls="resp-hub-upload-panel" aria-selected={mode === 'upload'} tabIndex={mode === 'upload' ? 0 : -1} className={mode === 'upload' ? 'is-active' : ''} onClick={() => setMode('upload')}>
                <Icon name="analytics" size={18} /> อัปโหลดวิดีโอ
              </button>
            </div>

            {mode === 'camera' ? (
              <div id="resp-hub-camera-panel" role="tabpanel" aria-labelledby="resp-hub-camera-tab" className="resp-hub-preview">
                <div className="resp-hub-preview-toolbar" aria-label="สถานะกล้อง">
                  <span><i aria-hidden="true" />รอข้อมูลจริง</span>
                  <span>FPS · --</span>
                  <span>ความชัด · --</span>
                </div>
                <div className="resp-hub-guide-frame" aria-label="กรอบแนะนำตำแหน่งใบหน้าและช่วงอก">
                  <span className="resp-hub-guide-face" aria-hidden="true" />
                  <span className="resp-hub-guide-torso" aria-hidden="true" />
                  <span className="resp-hub-guide-caption">จัดใบหน้าและช่วงอกให้อยู่ในกรอบ</span>
                  <span className="resp-hub-preview-empty"><Icon name="videocam" size={28} />พรีวิวกล้องจะแสดงเมื่อเชื่อมต่อการตรวจจริง</span>
                </div>
                <div className="resp-hub-preview-footer"><span>ระยะเวลาตรวจที่กำหนด</span><strong>00:30</strong></div>
              </div>
            ) : (
              <div id="resp-hub-upload-panel" role="tabpanel" aria-labelledby="resp-hub-upload-tab">
              <button className="resp-hub-upload" type="button" onClick={showModelPending}>
                <Icon name="analytics" size={30} />
                <strong>ลากวิดีโอมาวาง หรือเลือกไฟล์</strong>
                <span>รองรับรูปแบบวิดีโอเมื่อเชื่อมต่อโมเดลจริง</span>
                <span className="resp-hub-upload-action">เลือกไฟล์</span>
              </button>
              </div>
            )}

            <div className="resp-hub-waveform" aria-label="กราฟคลื่นการหายใจ รอข้อมูลจริง">
              <div className="resp-hub-waveform-heading"><span>คลื่นสัญญาณการหายใจ</span><span className="resp-hub-pending-badge">รอข้อมูลจริง</span></div>
              <svg viewBox="0 0 600 72" role="img" aria-label="ยังไม่มีข้อมูลสัญญาณสำหรับแสดงกราฟ">
                <path d="M0 18H600M0 36H600M0 54H600" />
                <path d="M0 36H600" className="resp-hub-wave-empty" />
              </svg>
            </div>

            <div className="resp-hub-actions">
              <button className="resp-hub-primary" type="button" onClick={showModelPending}><Icon name="vital_signs" size={18} />เริ่มตรวจจับ (30 วินาที)</button>
              <button className="resp-hub-secondary" type="button" onClick={showModelPending}><Icon name="videocam" size={18} />ถ่ายภาพ</button>
            </div>
            <p className="resp-hub-action-note" role="status" aria-live="polite">{notice || 'การตรวจวัดยังไม่ทำงานในหน้าต้นแบบนี้'}</p>
            <a className="resp-hub-consent-link" href="#resp-hub-privacy">อ่านข้อมูลความยินยอมและการประมวลผล</a>
          </section>

          <aside className="resp-hub-readiness-card" aria-labelledby="readiness-title">
            <div className="resp-hub-card-heading">
              <div><span className="resp-hub-eyebrow">Camera readiness</span><h2 id="readiness-title">ความพร้อมของภาพและกล้อง</h2></div>
            <span className="resp-hub-readiness-count">รอข้อมูลจริง</span>
            </div>
            <p className="resp-hub-waiting-note">ผลทั้ง 9 รายการจะแสดงหลังมีการตรวจจริง</p>
            <details className="resp-hub-quality-details">
              <summary>ดูเกณฑ์ตรวจคุณภาพทั้ง 9 รายการ</summary>
              <ul className="resp-hub-quality-list">
                {QUALITY_ITEMS.map((item) => <li key={item}><span className="resp-hub-quality-dot" aria-hidden="true" /><span>{item}</span><b>รอข้อมูลจริง</b></li>)}
              </ul>
            </details>
            <div className="resp-hub-posture">
              <strong><Icon name="health_and_safety" size={18} />คำแนะนำการจัดท่า</strong>
              <ul>
                <li>นั่งตัวตรงและอยู่นิ่งตลอดช่วงตรวจ</li>
                <li>วางกล้องระดับลำตัว ให้เห็นไหล่และช่วงอก</li>
                <li>จัดแสงให้พอเหมาะและหายใจตามธรรมชาติ</li>
              </ul>
            </div>
            <p className="resp-hub-privacy-note">ข้อมูลกล้องจะยังไม่ถูกขอหรือส่งจากหน้านี้ หน้าตรวจจริงต้องแจ้งรายละเอียดและขอความยินยอมก่อนใช้งาน</p>
          </aside>
        </div>

        <section className="resp-hub-reference" aria-labelledby="reference-title">
          <span className="resp-hub-eyebrow">ข้อมูลประกอบ</span>
          <h2 id="reference-title">ข้อมูลอ้างอิงและข้อจำกัด</h2>
          <details>
            <summary>Biometric AI Framework</summary>
            <p>ระบบเดิมใช้ MediaPipe Pose Landmarker สำหรับตำแหน่งร่างกาย และใช้ VitalLens POS กับวิดีโอที่อัปโหลดเพื่อประมาณสัญญาณชีพ ทั้งสองส่วนไม่ใช่โมเดลวินิจฉัยโรค และหน้ารวมนี้ยังไม่แสดงผลตรวจจนกว่าจะเชื่อมข้อมูลจริง</p>
          </details>
          <details id="resp-hub-privacy">
            <summary>PDPA และการประมวลผลข้อมูล</summary>
            <p>โหมดกล้องเดิมวิเคราะห์ภาพในเบราว์เซอร์ ส่วนวิดีโออัปโหลดในระบบเดิมถูกส่งไป Backend เพื่อประมวลผลและใช้ไฟล์ชั่วคราว การใช้งานจริงต้องแสดง consent และขอความยินยอมก่อนเปิดกล้องหรือส่งวิดีโอ</p>
          </details>
          <details>
            <summary>Medical Disclaimer</summary>
            <p>{RISK_DISCLAIMER}</p>
          </details>
        </section>

        <footer className="resp-hub-footer">
          <span>AIRCHECK MD · ต้นแบบคัดกรองสัญญาณเบื้องต้น</span>
          <a href="tel:1669" aria-label="โทรสายด่วนฉุกเฉิน 1669">กรณีฉุกเฉิน โทร 1669</a>
          <Link to="/assessment">ไปยังแบบประเมินสุขภาพ</Link>
        </footer>
      </div>
    </main>
  )
}
