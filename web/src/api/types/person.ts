// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export interface PersonInformation {
  id: string
  fingerprint: string
  name: string
  privacy: string
  profile: string
  style: { accent?: string }
  avatar: string
  banner: string
  favicon: string
}

export type MutationSuccess = Record<string, unknown>
