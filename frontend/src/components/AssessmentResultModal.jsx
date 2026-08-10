function AssessmentResultModal({ isOpen, onClose, result, score, redFlag }) {
  if (!isOpen) return null

  const tone = redFlag ? 'critical' : result?.tone || 'moderate'
  const headline = redFlag
    ? 'ผลการประเมิน: ความเสี่ยงเร่งด่วน'
    : `ผลการประเมิน: ความเสี่ยงระดับ${result.label}`

  const description = redFlag
    ? 'คุณมีสัญญาณอันตรายที่ควรได้รับการดูแลอย่างเร่งด่วน โปรดติดต่อแพทย์หรือบริการฉุกเฉินทันที'
    : result.advice

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="result-modal-overlay" onClick={handleOverlayClick}>
      <div className={`result-modal result-modal--${tone}`} role="dialog" aria-modal="true" aria-label="ผลการประเมินความเสี่ยง">
        <div className="result-modal-header">
          <div className="result-modal-badge" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M32 10c-6.4 0-11.8 2.8-15.4 7.2-3.2 3.9-4.4 8.7-3.8 13.6 1.3 10.2 8.4 18.7 19.2 22.7 10.8-4 17.9-12.5 19.2-22.7.6-4.9-.6-9.7-3.8-13.6C43.8 12.8 38.4 10 32 10Z" stroke="currentColor" strokeWidth="3" />
              <path d="M24 26c1.7 1.7 3.6 2.8 5.8 3.5 2.2.7 4.4 1 6.7 1 2.3 0 4.7-.3 6.9-1 2.2-.7 4.1-1.8 5.8-3.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M20 39c3.7-2.4 8.2-3.7 13-3.7 4.8 0 9.3 1.3 13 3.7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="result-modal-body">
          <p className="result-modal-kicker">ผลการประเมินเบื้องต้น</p>
          <h2>{headline}</h2>
          <p className="result-modal-copy">{description}</p>

          <label className="result-modal-check">
            <input type="checkbox" defaultChecked />
            <span>ฉันยินยอมตามข้อตกลงและนโยบายความเป็นส่วนตัว (PDPA)</span>
          </label>

          <div className="result-modal-actions">
            <button className="result-modal-btn result-modal-btn-secondary" type="button" onClick={onClose}>
              ปิดหน้าต่าง
            </button>
            <button className="result-modal-btn result-modal-btn-primary" type="button">
              เรียนรู้เพิ่มเติม
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AssessmentResultModal
