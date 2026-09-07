// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { describe, expect, it } from 'vitest'
import { searchMatches, searchRange } from './search'

describe('searchRange', () => {
  it('maps an accent-folded hit back to the original characters', () => {
    expect(searchRange('Émile', 'emi')).toEqual([0, 3])
  })

  it('highlights the character that matched, not a later plain one', () => {
    expect(searchRange('Émile', 'e')).toEqual([0, 1])
  })

  it('spans a character whose lowercase form is longer than itself', () => {
    expect(searchRange('İbrahim', 'ib')).toEqual([0, 2])
  })

  it('skips a combining mark the filter ignores', () => {
    expect(searchRange('Zoë Smith', 'zoe s')).toEqual([0, 6])
  })

  it('finds a plain hit in the middle', () => {
    expect(searchRange('Jane Doe', 'doe')).toEqual([5, 8])
  })

  it('is null for an empty query or no hit', () => {
    expect(searchRange('Jane', '')).toBeNull()
    expect(searchRange('Jane', 'x')).toBeNull()
  })

  it('agrees with searchMatches on every case', () => {
    for (const [text, query] of [
      ['Émile', 'emi'],
      ['Zoë', 'zoe'],
      ['plain', 'ain'],
      ['naïve', 'x'],
      ['Ångström', 'angs'],
    ]) {
      expect(searchRange(text, query) !== null).toBe(searchMatches(text, query))
    }
  })
})
