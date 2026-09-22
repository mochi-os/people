// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { Contacts } from '@/features/contacts'

export const Route = createFileRoute('/_authenticated/books/$id')({
  component: BookPage,
})

function BookPage() {
  const { id } = Route.useParams()
  return <Contacts book={id} />
}
