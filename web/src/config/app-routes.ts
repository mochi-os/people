// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export const APP_ROUTES = {
  CHAT: {
    // Trailing slash matters: core redirects /chat -> /chat/ and the redirect
    // drops the query string, which would lose the ?with=&name= handoff this
    // route exists to carry.
    HOME: '/chat/',
  },
} as const
