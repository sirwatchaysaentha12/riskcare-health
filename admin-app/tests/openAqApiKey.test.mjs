import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeApiKey } from '../src/lib/apiKeySanitize.ts'

test('key wrapped in angle brackets is cleaned automatically (the 2026-09-24 incident)', () => {
  const result = sanitizeApiKey('<02138b49e02533a1f0c5219c9a1ad9fe8bc5e16cd4f3c7dc4f5df43656ffd36c>')
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.apiKey === '02138b49e02533a1f0c5219c9a1ad9fe8bc5e16cd4f3c7dc4f5df43656ffd36c')
})

test('surrounding whitespace is trimmed', () => {
  const result = sanitizeApiKey('  abc123  ')
  assert.ok(result.ok && result.apiKey === 'abc123')
})

test('a clean key passes through untouched', () => {
  const result = sanitizeApiKey('02138b49e02533a1f0c5219c9a1ad9fe8bc5e16cd4f3c7dc4f5df43656ffd36c')
  assert.ok(result.ok && result.apiKey === '02138b49e02533a1f0c5219c9a1ad9fe8bc5e16cd4f3c7dc4f5df43656ffd36c')
})

test('blank or bracket-only keys report empty', () => {
  for (const raw of ['', '   ', '<>']) {
    const result = sanitizeApiKey(raw)
    assert.deepEqual(result, { ok: false, status: 'empty' }, `input: ${JSON.stringify(raw)}`)
  }
})

test('leftover angle brackets inside, control chars, or quote wrapping are malformed', () => {
  for (const raw of ['ab<cd>ef', 'ab\tcd', "'abc'", '`abc`']) {
    const result = sanitizeApiKey(raw)
    assert.deepEqual(result, { ok: false, status: 'malformed' }, `input: ${JSON.stringify(raw)}`)
  }
})
