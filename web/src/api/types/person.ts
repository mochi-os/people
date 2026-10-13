// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export interface PersonInformation {
  id: string
  fingerprint: string
  name: string
  // Sent only to the person's owner.
  privacy?: string
  profile: string
  style: { accent?: string }
  avatar: string
  banner: string
  favicon: string
  // The person's accounts on other networks, as the profile links them.
  accounts?: ProfileAccount[]
}

export interface ProfileAccount {
  type: string
  identifier: string
  name: string
  url: string
}

export type MutationSuccess = Record<string, unknown>
