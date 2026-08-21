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
