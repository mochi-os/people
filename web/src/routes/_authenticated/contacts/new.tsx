// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { createFileRoute } from '@tanstack/react-router'
import { ContactEditor } from '@/features/contacts/editor'

interface SearchParams {
  // The address book the contact was started from.
  book?: string
}

export const Route = createFileRoute('/_authenticated/contacts/new')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    book: typeof search.book === 'string' ? search.book : undefined,
  }),
  component: NewContactPage,
})

function NewContactPage() {
  const { book } = Route.useSearch()
  return <ContactEditor book={book} />
}
