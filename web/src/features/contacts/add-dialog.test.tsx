// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddContactDialog } from './add-dialog'

const person = {
  class: 'person',
  created: 0,
  data: '',
  fingerprint: 'abcdefghi',
  fingerprint_hyphens: 'abc-def-ghi',
  id: 'p1',
  location: '',
  name: 'Ada Lovelace',
  updated: 0,
  relationship: 'none',
}

// The requests the dialog makes, and where it navigates.
const calls = vi.hoisted(() => ({
  create: vi.fn(),
  invite: vi.fn(),
  navigate: vi.fn(),
}))

beforeEach(() => {
  calls.create = vi.fn().mockResolvedValue({})
  calls.invite = vi.fn().mockResolvedValue({})
  calls.navigate = vi.fn()
})

vi.mock('@/hooks/useContacts', () => ({
  useContactsQuery: () => ({ data: { contacts: [], received: [], sent: [] } }),
  useSearchDirectoryQuery: () => ({
    data: { results: [person] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateContactMutation: () => ({
    mutateAsync: calls.create,
    isPending: false,
  }),
  useInviteFriendMutation: () => ({
    mutateAsync: calls.invite,
    isPending: false,
  }),
  useAcceptFriendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/api/person', () => ({
  personApi: { getInformation: () => Promise.resolve({}) },
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => calls.navigate,
}))

function show(props: {
  book?: string
  link?: { contact: string; name: string }
}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <AddContactDialog open onOpenChange={vi.fn()} {...props} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

async function search() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ada' } })
  await screen.findByText('Ada Lovelace')
}

describe('AddContactDialog', () => {
  it('offers only the invite that links a card, never a second contact', async () => {
    show({ link: { contact: 'c1', name: 'Ada Lovelace' } })
    await screen.findByText('Ada Lovelace')
    expect(screen.queryByRole('button', { name: /Add to contacts/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Invite/ })).toBeEnabled()
  })

  it('adds a contact to the book being viewed', async () => {
    show({ book: 'b2' })
    await search()
    fireEvent.click(screen.getByRole('button', { name: /Add to contacts/ }))
    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1))
    expect(calls.create.mock.calls[0][0]).toMatchObject({
      person: 'p1',
      book: 'b2',
    })
  })

  it('invites into the book being viewed', async () => {
    show({ book: 'b2' })
    await search()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    await waitFor(() => expect(calls.invite).toHaveBeenCalledTimes(1))
    expect(calls.invite.mock.calls[0][0]).toEqual({
      person: 'p1',
      name: 'Ada Lovelace',
      book: 'b2',
    })
  })

  it('starts a new contact in the book being viewed', () => {
    show({ book: 'b2' })
    fireEvent.click(screen.getByRole('button', { name: /New contact/ }))
    expect(calls.navigate).toHaveBeenCalledWith({
      to: '/contacts/new',
      search: { book: 'b2' },
    })
  })
})
