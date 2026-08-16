import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoIcon from '../components/LogoIcon'
import AssessmentResultModal from '../components/AssessmentResultModal'
import RiskQuestion from '../components/RiskQuestion'
import { supabase } from '../lib/supabase'

const questions = [
  {
    id: 'age', section: 'ข้อมูลพื้นฐาน', label: 'อายุของคุณอยู่ในช่วงใด?', options: [
      { value: 'under18', label: 'ต่ำกว่า 18 ปี', score: 0 },
      { value: '18to39', label: '18–39 ปี', score: 0 },
      { value: '40to64', label: '40–64 ปี', score: 1 },
      { value: '65plus', label: '65 ปีขึ้นไป', score: 2 },
    ],
  },
  {
    id: 'vulnerable', section: 'ข้อมูลพื้นฐาน', label: 'อยู่ในกลุ่มเด็กเล็ก ผู้สูงอายุ ตั้งครรภ์ หรือภูมิคุ้มกันต่ำหรือไม่?', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'yes', label: 'ใช่', score: 2 },
      { value: 'unknown', label: 'ไม่แน่ใจ', score: 0 },
    ],
  },
  {
    id: 'lungDisease', section: 'ประวัติสุขภาพ', label: 'เคยได้รับการวินิจฉัยว่าเป็นหอบหืด COPD หรือโรคปอดเรื้อรังหรือไม่?', options: [
      { value: 'none', label: 'ไม่เคย', score: 0 },
      { value: 'controlled', label: 'เคยและควบคุมได้', score: 3 },
      { value: 'active', label: 'เคยและยังมีอาการ', score: 4 },
    ],
  },
  {
    id: 'allergy', section: 'ประวัติสุขภาพ', label: 'มีภูมิแพ้ จมูกอักเสบจากภูมิแพ้ หรือผื่นภูมิแพ้หรือไม่?', options: [
      { value: 'no', label: 'ไม่มี', score: 0 },
      { value: 'yes', label: 'มี', score: 1 },
      { value: 'unknown', label: 'ไม่แน่ใจ', score: 0 },
    ],
  },
  {
    id: 'comorbidity', section: 'ประวัติสุขภาพ', label: 'มีโรคหัวใจหรือโรคเรื้อรังสำคัญที่ทำให้หายใจลำบากหรือไม่?', options: [
      { value: 'no', label: 'ไม่มี', score: 0 },
      { value: 'yes', label: 'มี', score: 2 },
    ],
  },
  {
    id: 'infection', section: 'ประวัติสุขภาพ', label: 'เคยติดเชื้อทางเดินหายใจรุนแรง หรือติดเชื้อซ้ำบ่อยหรือไม่?', options: [
      { value: 'no', label: 'ไม่เคย', score: 0 },
      { value: 'once', label: 'เคยครั้งเดียว', score: 1 },
      { value: 'recent', label: 'ซ้ำบ่อย หรือเพิ่งติดเชื้อใน 4 สัปดาห์นี้', score: 2 },
    ],
  },
  {
    id: 'tobacco', section: 'พฤติกรรมและสิ่งแวดล้อม', label: 'สูบบุหรี่ บุหรี่ไฟฟ้า ยาเส้น หรือยาสูบอื่นหรือไม่?', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'past', label: 'เคยแต่เลิกแล้ว', score: 1 },
      { value: 'some', label: 'บางวัน', score: 3 },
      { value: 'daily', label: 'ทุกวัน', score: 4 },
    ],
  },
  {
    id: 'secondhand', section: 'พฤติกรรมและสิ่งแวดล้อม', label: 'ได้รับควันบุหรี่มือสองที่บ้านหรือที่ทำงาน?', options: [
      { value: 'never', label: 'ไม่เคย', score: 0 },
      { value: 'sometimes', label: 'บางครั้ง', score: 1 },
      { value: 'often', label: 'บ่อยหรือเกือบทุกวัน', score: 2 },
    ],
  },
  {
    id: 'workExposure', section: 'พฤติกรรมและสิ่งแวดล้อม', label: 'งานหรือบ้านสัมผัสฝุ่น ควัน สารเคมี ไอระเหย เชื้อรา หรือควันทำอาหาร?', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'sometimes', label: 'บางครั้ง', score: 1 },
      { value: 'often', label: 'บ่อย', score: 3 },
    ],
  },
  {
    id: 'outdoor', section: 'พฤติกรรมและสิ่งแวดล้อม', label: 'อยู่กลางแจ้งหรือออกแรงหนักในวันที่มีควัน/ฝุ่นมาก', options: [
      { value: 'never', label: 'ไม่', score: 0 },
      { value: 'some', label: '1–2 วันต่อสัปดาห์', score: 1 },
      { value: 'often', label: '3 วันขึ้นไปต่อสัปดาห์', score: 2 },
    ],
  },
  {
    id: 'cough', section: 'อาการปัจจุบัน', label: 'ไอหรือมีเสมหะนานเกิน 3 สัปดาห์ หรือไอซ้ำบ่อย', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'cough', label: 'มีไอ', score: 1 },
      { value: 'persistent', label: 'มีเสมหะหรือไอเรื้อรัง', score: 3 },
    ],
  },
  {
    id: 'wheeze', section: 'อาการปัจจุบัน', label: 'มีเสียงหวีด แน่นหน้าอก หรือหายใจไม่อิ่ม', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'sometimes', label: 'บางครั้ง', score: 1 },
      { value: 'often', label: 'บ่อยหรือรบกวนการนอน', score: 3 },
    ],
  },
  {
    id: 'breathless', section: 'อาการปัจจุบัน', label: 'เหนื่อยง่ายกว่าปกติหรือหอบเมื่อเดิน/ขึ้นบันได', options: [
      { value: 'no', label: 'ไม่', score: 0 },
      { value: 'mild', label: 'เล็กน้อย', score: 1 },
      { value: 'limited', label: 'ชัดเจนหรือจำกัดกิจวัตร', score: 3 },
    ],
  },
  {
    id: 'redFlag', section: 'ความปลอดภัย', label: 'มีสัญญาณฉุกเฉิน เช่น หายใจลำบากมาก พูดไม่เป็นประโยค ปากเขียว สับสน เจ็บหน้าอกรุนแรง หรืออาการแย่ลงเร็ว', options: [
      { value: 'no', label: 'ไม่มี', score: 0 },
      { value: 'yes', label: 'มี', score: 99 },
    ],
  },
]

const sections = [...new Set(questions.map((question) => question.section))]

const provincesByRegion = {
  'เหนือ': ['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์', 'พิษณุโลก', 'สุโขทัย', 'เพชรบูรณ์', 'กำแพงเพชร', 'พิจิตร', 'ตาก'],
  'กลาง': ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม', 'พระนครศรีอยุธยา', 'สระบุรี', 'ลพบุรี', 'ราชบุรี', 'กาญจนบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์', 'ชัยนาท', 'นครสวรรค์', 'อ่างทอง', 'สิงห์บุรี', 'สุพรรณบุรี'],
  'ตะวันออกเฉียงเหนือ': ['ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'อุบลราชธานี', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'ร้อยเอ็ด', 'มหาสารคาม', 'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร', 'ยโสธร', 'ชัยภูมิ', 'หนองคาย', 'หนองบัวลำภู', 'บึงกาฬ', 'เลย', 'อำนาจเจริญ'],
  'ใต้': ['ชุมพร', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'ตรัง', 'พัทลุง', 'สงขลา', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส', 'ระนอง']
}

function getResult(score, redFlag) {
  if (redFlag) return { label: 'ต้องได้รับการดูแลเร่งด่วน', tone: 'critical', advice: 'มีสัญญาณอันตราย ควรติดต่อบริการฉุกเฉินในพื้นที่ทันที และไม่ควรรอผลจากแบบสอบถาม' }
  if (score >= 16) return { label: 'สูงมาก', tone: 'very-high', advice: 'หลีกเลี่ยงควันและมลพิษ ขอคำแนะนำจากบุคลากรทางการแพทย์โดยเร็ว และเฝ้าระวังอาการ' }
  if (score >= 10) return { label: 'สูง', tone: 'high', advice: 'หลีกเลี่ยงกิจกรรมหนักในวันที่ AQI/PM2.5 สูง อยู่ในอาคารที่อากาศถ่ายเท และนัดประเมินกับบุคลากรทางการแพทย์' }
  if (score >= 5) return { label: 'ปานกลาง', tone: 'moderate', advice: 'ลดควันและฝุ่น สวมหน้ากากที่เหมาะสมเมื่อมลพิษสูง และลดเวลา/ความหนักของกิจกรรมกลางแจ้ง' }
  return { label: 'ต่ำ', tone: 'low', advice: 'ทำกิจกรรมได้ตามปกติ สังเกตอาการ ลดควันบุหรี่ และตรวจคุณภาพอากาศก่อนออกนอกบ้าน' }
}

function Assessment() {
  const navigate = useNavigate()
  const resultRef = useRef(null)
  const [answers, setAnswers] = useState({})
  const [region, setRegion] = useState('')
  const [province, setProvince] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const score = useMemo(() => questions.reduce((total, question) => {
    const selected = question.options.find((option) => option.value === answers[question.id])
    return total + (selected?.score || 0)
  }, 0), [answers])
  const redFlag = answers.redFlag === 'yes'
  const result = getResult(score, redFlag)
  const answeredCount = Object.keys(answers).length
  const isFormComplete = answeredCount >= questions.length && region && province
  const [validationMessage, setValidationMessage] = useState('')

  const progressPercent = Math.round((answeredCount / questions.length) * 100)

  function handleChange(id, value) {
    setAnswers((current) => ({ ...current, [id]: value }))
    setSubmitted(false)
    if (validationMessage) setValidationMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!isFormComplete || isProcessing) {
      setValidationMessage('กรุณากรอกคำถามให้ครบทุกข้อก่อนกดดูผลการประเมิน')
      const firstUnanswered = questions.find((question) => !answers[question.id])
      if (firstUnanswered) {
        const element = document.querySelector(`[name="${firstUnanswered.id}"]`)
        element?.closest('.question-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    setIsProcessing(true)
    setSubmitted(false)
    const healthRiskGroup = redFlag || score >= 10 ? 'high_critical' : score >= 5 ? 'moderate' : 'low'

    try {
      if (!supabase) throw new Error('Supabase is not configured')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User is not authenticated')

      const { error: assessmentError } = await supabase.from('risk_assessments').insert({
        user_id: user.id,
        answers,
        score,
        risk_level: result.label,
        red_flag: redFlag,
      })
      if (assessmentError) throw assessmentError

      const { error: profileError } = await supabase.from('profiles').update({
        region,
        province,
        health_risk_group: healthRiskGroup,
        has_completed_assessment: true,
      }).eq('id', user.id)
      if (profileError) throw profileError

      setIsProcessing(false)
      setSubmitted(true)
      setIsModalOpen(true)
    } catch (error) {
      console.error('Failed to save assessment:', error)
      setIsProcessing(false)
      setValidationMessage('บันทึกผลการประเมินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <main className="assessment-page">
      <header className="assessment-header">
        <button className="back-button" type="button" onClick={() => navigate('/')}>← กลับหน้าภาพรวม</button>
        <div className="assessment-brand"><LogoIcon /></div>
        <span className="progress-label">ตอบแล้ว {answeredCount}/{questions.length}</span>
        <div className="assessment-progress-track">
          <div className="assessment-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </header>
      <section className="assessment-shell">
        <AssessmentResultModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} result={result} score={score} redFlag={redFlag} />
        <div className="assessment-intro">
          <p className="eyebrow">แบบประเมินคัดกรองเบื้องต้น</p>
          <h1>รู้จักความเสี่ยง<br />ของระบบทางเดินหายใจ</h1>
          <p>ตอบคำถามสั้น ๆ ตามอาการและการสัมผัสในช่วง 4 สัปดาห์ที่ผ่านมา ใช้เวลาประมาณ 3 นาที</p>
          <div className="assessment-note"><strong>สำคัญ</strong><span>ผลนี้เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยโรค</span></div>
        </div>
        {submitted && (
          <section ref={resultRef} className={`result-card ${result.tone}`} aria-live="polite">
            <div><span className="result-kicker">ผลการคัดกรอง</span><h2>ระดับความเสี่ยง: {result.label}</h2><p>{result.advice}</p></div>
          </section>
        )}
        <form className="assessment-form" onSubmit={handleSubmit}>
          <section className="question-section assessment-location-section">
            <div className="section-heading"><span>00</span><h2>พื้นที่ที่คุณอาศัยอยู่</h2></div>
            <div className="assessment-location-grid">
              <label className="assessment-select-label">ภาค
                <select value={region} onChange={(event) => { setRegion(event.target.value); setProvince('') }} required>
                  <option value="">เลือกภาค</option>
                  {Object.keys(provincesByRegion).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="assessment-select-label">จังหวัด
                <select value={province} onChange={(event) => setProvince(event.target.value)} disabled={!region} required>
                  <option value="">{region ? 'เลือกจังหวัด' : 'กรุณาเลือกภาคก่อน'}</option>
                  {(provincesByRegion[region] || []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </section>
          {sections.map((section) => (
            <section className="question-section" key={section}>
              <div className="section-heading"><span>{String(sections.indexOf(section) + 1).padStart(2, '0')}</span><h2>{section}</h2></div>
              {questions.filter((question) => question.section === section).map((question) => (
                <RiskQuestion key={question.id} question={question} value={answers[question.id]} onChange={handleChange} />
              ))}
            </section>
          ))}
          <div
            className="submit-wrapper"
            onMouseEnter={() => {
              if (!isFormComplete) setValidationMessage('กรุณากรอกข้อมูลให้ครบทุกข้อก่อนกดดูผลการประเมิน')
            }}
            onMouseLeave={() => {
              if (!isFormComplete) setValidationMessage('')
            }}
            onFocus={() => {
              if (!isFormComplete) setValidationMessage('กรุณากรอกข้อมูลให้ครบทุกข้อก่อนกดดูผลการประเมิน')
            }}
            onBlur={() => {
              if (!isFormComplete) setValidationMessage('')
            }}
            onTouchStart={() => {
              if (!isFormComplete) setValidationMessage('กรุณากรอกข้อมูลให้ครบทุกข้อก่อนกดดูผลการประเมิน')
            }}
            onClick={() => {
              if (!isFormComplete) setValidationMessage('กรุณากรอกข้อมูลให้ครบทุกข้อก่อนกดดูผลการประเมิน')
            }}
          >
            <button className="assessment-submit" type="submit" disabled={!isFormComplete || isProcessing}>
              {isProcessing ? 'กำลังประมวลผล...' : 'ดูผลการประเมิน'} <span>→</span>
            </button>
          </div>
          <p className={`form-hint ${!isFormComplete ? 'is-visible' : ''}`} role="status" aria-live="polite">
            {validationMessage || 'ตอบคำถามให้ครบทุกข้อเพื่อดูผลการประเมิน'}
          </p>
        </form>
      </section>
      {isProcessing && (
        <div className="processing-overlay" role="status" aria-live="polite">
          <div className="processing-modal">
            <span className="processing-spinner" aria-hidden="true" />
            <strong>กำลังประเมินความเสี่ยง</strong>
            <p>ระบบกำลังสรุปข้อมูลของคุณสักครู่</p>
          </div>
        </div>
      )}
    </main>
  )
}

export default Assessment
