// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { Contacts } from '@/features/contacts'

// A link to a contact opens the list with the contact in its side panel.
export const Route = createFileRoute('/_authenticated/contacts/$id')({
  component: ContactPage,
})

function ContactPage() {
  const { id } = Route.useParams()
  return <Contacts open={id} />
}
