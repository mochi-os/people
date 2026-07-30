// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Group a 9-character fingerprint for reading aloud and copying by hand. Anything
// that is not exactly nine characters is returned untouched rather than grouped
// into a shape that would imply it is a fingerprint when it is not.
export function formatFingerprint(fingerprint: string): string {
  if (!fingerprint || fingerprint.length !== 9) return fingerprint
  return `${fingerprint.slice(0, 3)}-${fingerprint.slice(3, 6)}-${fingerprint.slice(6)}`
}
