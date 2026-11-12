// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Whether an account's address is one a profile links: a web page, or the
// xmpp: address a chat client opens.
export function profileLink(url: string): boolean {
  return /^(https:\/\/|xmpp:)/.test(url)
}
