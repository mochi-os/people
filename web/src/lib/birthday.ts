// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { DateFormat } from '@mochi/web'

// A birthday as the editor's fields hold it: the day and year as typed, the
// month as 1 to 12 or empty. A year is optional; a day and month are not.
export interface BirthdayParts {
  day: string
  month: string
  year: string
}

export type BirthdayPart = keyof BirthdayParts

export const NO_BIRTHDAY: BirthdayParts = { day: '', month: '', year: '' }

// The forms vCard writes a birthday in: 1985-04-12 or 19850412 with its year,
// --04-12 or --0412 without, each with an optional time after T.
const FULL = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/
const YEARLESS = /^--(\d{2})-?(\d{2})(?:T.*)?$/

// birthdayParts(value) -> the fields for a stored birthday, or null for one
// the fields cannot show, such as text.
export function birthdayParts(value: string): BirthdayParts | null {
  const text = value.trim()
  if (!text) return NO_BIRTHDAY
  const full = FULL.exec(text)
  if (full) {
    return {
      day: String(Number(full[3])),
      month: String(Number(full[2])),
      year: full[1],
    }
  }
  const yearless = YEARLESS.exec(text)
  if (yearless) {
    return {
      day: String(Number(yearless[2])),
      month: String(Number(yearless[1])),
      year: '',
    }
  }
  return null
}

// birthdayValue(parts) -> the BDAY value for the fields: YYYY-MM-DD with a
// year, --MMDD without, empty when every field is empty, and null when the
// fields do not make a day of the year.
export function birthdayValue(parts: BirthdayParts): string | null {
  const day = ascii(parts.day.trim())
  const year = ascii(parts.year.trim())
  const month = parts.month
  if (!day && !month && !year) return ''
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month)) return null
  if (year && !/^\d{4}$/.test(year)) return null
  const d = Number(day)
  const m = Number(month)
  if (m < 1 || m > 12 || d < 1 || d > length(m, year ? Number(year) : null)) {
    return null
  }
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return year ? `${year}-${mm}-${dd}` : `--${mm}${dd}`
}

// birthdayOrder(format) -> the fields in the order the user's date format
// writes a date.
export function birthdayOrder(format: DateFormat): BirthdayPart[] {
  if (format === 'YYYY-MM-DD') return ['year', 'month', 'day']
  if (format === 'MM/DD/YYYY') return ['month', 'day', 'year']
  return ['day', 'month', 'year']
}

// The days in a month; February has 29 when the year is unknown, since a
// birthday without its year may be the 29th.
function length(month: number, year: number | null): number {
  if (month === 2) {
    const leap =
      year === null ||
      (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

// Digits from any script as ASCII, so a day typed on an Arabic or Devanagari
// keyboard is read as the number it is. Each script's digits are a run of ten
// code points starting at zero.
function ascii(text: string): string {
  return text.replace(/\p{Nd}/gu, (digit) => {
    const point = digit.codePointAt(0) ?? 0
    let start = point
    while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
    return String((point - start) % 10)
  })
}
