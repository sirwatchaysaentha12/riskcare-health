import { useEffect, useMemo, useRef, useState } from 'react'

// Consent Screen (Phase 5) — ต้องยอมรับก่อน getUserMedia / MediaRecorder ทุกครั้ง
// ข้อความครอบคลุม: ใช้กล้องทำอะไร / วัดนานเท่าไร / ประมวลผลที่ไหน / วิดีโอไป backend ไหม /
// raw video เก็บไหม / ไม่ใช่การวินิจฉัย / ยกเลิกได้
// แยก checkbox 3 ข้อ — research consent **ห้ามติ๊กไว้ล่วงหน้า**

// ข้อความแจ้ง consent — ไม่ export ออกจากไฟล์ component (react-refresh)
const CAMERA_PURPOSE_LINES = [
  'ใช้กล้องหน้า/ช่วงไหล่เพื่อ "ประมาณ" อัตราการหายใจ (จากการเคลื่อนไหวไหล่) และอัตราการเต้นหัวใจ (จากสีผิวใบหน้า วิธี rPPG)',
  'ระยะเวลาวัด: 30 วินาทีต่อครั้ง',
  'การประมวลผล: วิเคราะห์อัตราการหายใจในเครื่องของคุณ (MediaPipe) — ไม่มีวิดีโอขึ้นอินเทอร์เน็ต',
  'ส่วนชีพจร (rPPG): คลิปจากกล้องถูกส่งไป backend "ในเครื่องนี้เท่านั้น" (localhost) เพื่อประมวลผล แล้วลบทันทีหลังเสร็จ',
  'Raw Video: ระบบไม่เก็บคลิปวิดีโอไว้ในฐานข้อมูลหรือดิสก์ถาวร — ลบไฟล์ชั่วคราวทุกครั้งหลังประมวลผล (สำเร็จหรือล้มเหลวก็ตาม)',
  'ผลลัพธ์เป็นค่าประมาณจากกล้องเพื่อคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์',
  'คุณยกเลิกได้ทุกเมื่อระหว่างวัด (ปุ่มยกเลิก) — กล้องจะหยุดทันที',
]

export default function CameraConsent({ consent, onConsentChange }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const previousConsent = useRef(null)

  // Consent Audit Event — log เฉพาะสถานะความยินยอม (ไม่มีข้อมูลสุขภาพ/ตัวตน/วิดีโอ)
  // เพื่อให้ตรวจย้อนได้ว่า consent ถูกให้/ถอนเมื่อไร โดยไม่เก็บข้อมูลอ่อนไหว
  useEffect(() => {
    const prev = previousConsent.current
    if (prev === consent) return
    previousConsent.current = consent
    const isInitial = prev === null
    const event = isInitial ? 'initialized' : consent.camera && consent.limitations ? 'granted' : 'revoked'
    const audit = {
      event,
      camera: consent.camera === true,
      limitations: consent.limitations === true,
      research: consent.research === true,
      acknowledged: acknowledged === true,
      at: new Date().toISOString(),
    }
    console.info('[rrisk-consent]', JSON.stringify(audit))
    try {
      window.dispatchEvent(new CustomEvent('rrisk-consent', { detail: audit }))
    } catch { /* สภาพแวดล้อมไม่รองรับ CustomEvent — ข้าม */ }
  }, [consent, acknowledged])

  const readyToUse = useMemo(
    () => consent.camera && consent.limitations,
    [consent.camera, consent.limitations],
  )

  function update(field, value) {
    onConsentChange({ ...consent, [field]: value })
  }

  function toggleAcknowledged() {
    const next = !acknowledged
    setAcknowledged(next)
    if (!next) {
      // ยกเลิกการรับทราบ = ปิดการใช้กล้องทันที (รวมถึงระหว่างวัดด้วย)
      onConsentChange({ ...consent, camera: false, limitations: false, research: false })
    }
  }

  return (
    <div className="rrisk-consent" aria-label="ความยินยอมการใช้กล้องและข้อมูล">
      <h3>ก่อนใช้กล้อง — โปรดอ่านและเลือกยินยอม</h3>
      <ul className="rrisk-consent-info">
        {CAMERA_PURPOSE_LINES.map((line, index) => <li key={index}>{line}</li>)}
      </ul>
      <div className="rrisk-consent-options">
        <label className="rrisk-consent-item">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={toggleAcknowledged}
          />
          ฉันรับทราบข้อมูลข้างต้นครบถ้วน
        </label>
        <label className={`rrisk-consent-item ${acknowledged ? '' : 'rrisk-consent-item--disabled'}`}>
          <input
            type="checkbox"
            checked={consent.camera}
            disabled={!acknowledged}
            onChange={(event) => update('camera', event.target.checked)}
          />
          ยินยอมให้เปิดกล้องเพื่อวัดสัญญาณตามที่ระบุ
        </label>
        <label className={`rrisk-consent-item ${acknowledged ? '' : 'rrisk-consent-item--disabled'}`}>
          <input
            type="checkbox"
            checked={consent.limitations}
            disabled={!acknowledged}
            onChange={(event) => update('limitations', event.target.checked)}
          />
          รับทราบข้อจำกัด: เป็นค่าประมาณจากกล้อง ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก และไม่ใช่การวินิจฉัย
        </label>
        <label className={`rrisk-consent-item ${acknowledged ? '' : 'rrisk-consent-item--disabled'}`}>
          <input
            type="checkbox"
            checked={consent.research}
            disabled={!acknowledged}
            onChange={(event) => update('research', event.target.checked)}
          />
          (สมัครใจ ไม่บังคับ) ยินยอมให้เก็บ "ผลการวัด" เพื่อการวิจัย/ปรับปรุงระบบ — ไม่รวมวิดีโอ ไม่รวมข้อมูลระบุตัวตน
        </label>
      </div>
      {!readyToUse && (
        <p className="rrisk-consent-note" role="status">
          ต้องยอมรับ "รับทราบข้อมูล" + "ยินยอมเปิดกล้อง" + "รับทราบข้อจำกัด" ก่อนจึงจะเริ่มวัดได้ — หากไม่ยินยอม ยังประเมินจากแบบประเมินอาการอย่างเดียวได้
        </p>
      )}
    </div>
  )
}
