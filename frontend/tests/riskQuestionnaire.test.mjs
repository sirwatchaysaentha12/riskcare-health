// ทดสอบ computeRiskLevel (แบบประเมินปัจจัยเสี่ยง) — v1.0 · 1 ต.ค. 2026
import test from 'node:test'
import assert from 'node:assert/strict'
import { RISK_QUESTIONS, computeRiskLevel } from '../src/utils/riskQuestionnaire.js'

test('ไม่ตอบอะไรเลย → ความเสี่ยงต่ำ', () => {
  const result = computeRiskLevel({})
  assert.equal(result.level, 'ต่ำ')
  assert.equal(result.score, 0)
})

test('ตอบใช่ 2 ข้อ → ปานกลาง', () => {
  const result = computeRiskLevel({ chronic_cough: true, smoking: true })
  assert.equal(result.level, 'ปานกลาง')
  assert.equal(result.score, 2)
})

test('ตอบใช่ 4 ข้อ → สูง', () => {
  const result = computeRiskLevel({ chronic_cough: true, dyspnea: true, smoking: true, chronic_disease: true })
  assert.equal(result.level, 'สูง')
  assert.equal(result.score, 4)
  assert.ok(result.advice.length > 10)
})

test('ค่าที่ไม่รู้จัก/undefined ไม่นับ', () => {
  const result = computeRiskLevel(null)
  assert.equal(result.level, 'ต่ำ')
  assert.equal(RISK_QUESTIONS.length, 6)
})
