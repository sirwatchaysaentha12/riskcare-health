function RiskQuestion({ question, value, onChange }) {
  const questionId = `q-${question.id}`

  return (
    <div className="question-card" role="group" aria-labelledby={questionId}>
      <h3 className="question-title" id={questionId}>
        {question.label}
      </h3>
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
    </div>
  )
}

export default RiskQuestion
