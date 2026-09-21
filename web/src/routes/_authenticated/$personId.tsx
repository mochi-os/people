// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { PublicProfile } from '@/features/profile/public'

// A person's own page, /people/<id or fingerprint>, served by the same SPA.
// The identifier comes from the path: inside the menu shell the document
// carries no routing metas, so nothing else names the person.
export const Route = createFileRoute('/_authenticated/$personId')({
  component: PersonPage,
})

function PersonPage() {
  const { personId } = Route.useParams()
  return <PublicProfile fingerprint={personId} />
}
