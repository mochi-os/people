// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Accent- and case-insensitive substring match, so filtering agrees with
// naturalCompare sorting: NFD splits combining marks off and they are dropped,
// so "é" matches "e".
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function searchMatches(haystack: string, needle: string): boolean {
  if (!needle) return true
  return fold(haystack).includes(fold(needle))
}

// Where the folded needle sits in the ORIGINAL haystack, as [start, end)
// offsets, or null when it does not match. The haystack is folded one code
// point at a time so that each folded unit remembers the character that
// produced it: "É" folds to one "e", a bare combining mark to nothing, and
// "İ" to "i" - the hit maps back to whole original characters either way.
export function searchRange(
  haystack: string,
  needle: string
): [number, number] | null {
  const query = fold(needle)
  if (!query) return null
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const character of haystack) {
    const piece = fold(character)
    for (let i = 0; i < piece.length; i++) {
      starts.push(offset)
      ends.push(offset + character.length)
    }
    folded += piece
    offset += character.length
  }
  const at = folded.indexOf(query)
  if (at < 0) return null
  return [starts[at], ends[at + query.length - 1]]
}
