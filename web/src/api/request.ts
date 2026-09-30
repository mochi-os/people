// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// The pages render their own failures, inline or in a toast of their own, so
// the global toast would be a second copy of the same message.
export const quiet = { mochi: { showGlobalErrorToast: false } } as const

export const form = {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
} as const

// A field left undefined is not sent: URLSearchParams would write it as the
// text "undefined", which the server reads as a value.
export const body = (fields: Record<string, string | undefined>) =>
  new URLSearchParams(
    Object.entries(fields).filter(
      (field): field is [string, string] => field[1] !== undefined
    )
  ).toString()
