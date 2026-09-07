// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { defineConfig } from 'vitest/config'

// Pure-function tests only; nothing here renders, so no DOM environment.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
