// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, expect, it } from 'vitest'
import { birthdayOrder, birthdayParts, birthdayValue } from './birthday'

describe('birthdayParts', () => {
  it('reads every form vCard writes a birthday in', () => {
    const full = { day: '12', month: '4', year: '1985' }
    expect(birthdayParts('1985-04-12')).toEqual(full)
    expect(birthdayParts('19850412')).toEqual(full)
    expect(birthdayParts('1985-04-12T00:00:00Z')).toEqual(full)
    const yearless = { day: '12', month: '4', year: '' }
    expect(birthdayParts('--0412')).toEqual(yearless)
    expect(birthdayParts('--04-12')).toEqual(yearless)
  })

  it('reads nothing as empty fields and text as nothing it can show', () => {
    expect(birthdayParts('')).toEqual({ day: '', month: '', year: '' })
    expect(birthdayParts('circa 1800')).toBeNull()
  })
})

describe('birthdayValue', () => {
  it('writes a full date with its year and --MMDD without one', () => {
    expect(birthdayValue({ day: '12', month: '4', year: '1985' })).toBe(
      '1985-04-12'
    )
    expect(birthdayValue({ day: '2', month: '10', year: '' })).toBe('--1002')
    expect(birthdayValue({ day: ' 2 ', month: '10', year: ' ' })).toBe('--1002')
  })

  it('writes nothing for empty fields', () => {
    expect(birthdayValue({ day: '', month: '', year: '' })).toBe('')
  })

  it('refuses fields that do not make a day of the year', () => {
    for (const parts of [
      { day: '12', month: '', year: '' },
      { day: '', month: '4', year: '' },
      { day: '', month: '', year: '1985' },
      { day: '31', month: '4', year: '' },
      { day: '0', month: '4', year: '' },
      { day: 'x', month: '4', year: '' },
      { day: '12', month: '4', year: '85' },
      { day: '29', month: '2', year: '2023' },
      { day: '29', month: '2', year: '1900' },
    ]) {
      expect(birthdayValue(parts), JSON.stringify(parts)).toBeNull()
    }
  })

  it('takes the 29th of February without a year or in a leap year', () => {
    expect(birthdayValue({ day: '29', month: '2', year: '' })).toBe('--0229')
    expect(birthdayValue({ day: '29', month: '2', year: '2024' })).toBe(
      '2024-02-29'
    )
    expect(birthdayValue({ day: '29', month: '2', year: '2000' })).toBe(
      '2000-02-29'
    )
  })

  it('reads digits typed in another script', () => {
    expect(birthdayValue({ day: '١٢', month: '4', year: '١٩٨٥' })).toBe(
      '1985-04-12'
    )
    expect(birthdayValue({ day: '१२', month: '4', year: '' })).toBe('--0412')
  })

  it('round-trips what it reads', () => {
    for (const value of ['1985-04-12', '--0412', '2024-02-29', '--1231']) {
      expect(birthdayValue(birthdayParts(value)!)).toBe(value)
    }
  })
})

describe('birthdayOrder', () => {
  it('follows the order the user writes a date in', () => {
    expect(birthdayOrder('YYYY-MM-DD')).toEqual(['year', 'month', 'day'])
    expect(birthdayOrder('MM/DD/YYYY')).toEqual(['month', 'day', 'year'])
    expect(birthdayOrder('DD/MM/YYYY')).toEqual(['day', 'month', 'year'])
    expect(birthdayOrder('DD.MM.YYYY')).toEqual(['day', 'month', 'year'])
    expect(birthdayOrder('D MMM YYYY')).toEqual(['day', 'month', 'year'])
  })
})
