// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Accent- and case-insensitive substring match for filtering user-facing lists.
//
// The lists these filter are sorted with naturalCompare, which treats "café" and
// "cafe" as equal - so a plain toLowerCase().includes() filter disagreed with the
// sort sitting beside it: typing "cafe" hid a row the ordering considered
// identical to it. Someone whose own name carries a diacritic could not find it
// by typing the letters they see.
//
// NFD splits a letter from its combining marks, and the mark range is then
// removed, so "é" matches "e" in both directions.
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function searchMatches(haystack: string, needle: string): boolean {
  if (!needle) return true
  return fold(haystack).includes(fold(needle))
}
