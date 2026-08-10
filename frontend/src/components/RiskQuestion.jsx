function RiskQuestion({ question, value, onChange }) {
  return (
    <fieldset className="question-card">
      <legend>{question.label}</legend>
      <div className="answer-list">
        {question.options.map((option) => (
          <label className={`answer-option ${value === option.value ? 'is-selected' : ''}`} key={option.value}>
            <input
              type="radio"
              name={question.id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(question.id, option.value)}
            />
            <span className="answer-radio" aria-hidden="true" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default RiskQuestion
