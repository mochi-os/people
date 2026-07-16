// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute } from '@tanstack/react-router'
import { getEntityFingerprint } from '@mochi/web'
import { Friends } from '@/features/friends'
import { PublicProfile } from '@/features/profile/public'

interface SearchParams {
  action?: string
}

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    action: typeof search.action === 'string' ? search.action : undefined,
  }),
  component: IndexPage,
})

function IndexPage() {
  const fingerprint = getEntityFingerprint()
  const { action } = Route.useSearch()
  return fingerprint ? <PublicProfile fingerprint={fingerprint} /> : <Friends autoAdd={action === 'add'} />
}
