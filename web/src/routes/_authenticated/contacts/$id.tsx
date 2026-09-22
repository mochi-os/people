// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { ContactEditor } from '@/features/contacts/editor'

export const Route = createFileRoute('/_authenticated/contacts/$id')({
  component: ContactEditPage,
})

function ContactEditPage() {
  const { id } = Route.useParams()
  return <ContactEditor id={id} />
}
