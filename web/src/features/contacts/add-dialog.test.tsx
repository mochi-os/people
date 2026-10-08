// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// A profile with something in it, which gets a preview step before connecting.
const profile = {
  id: 'p1',
  fingerprint: 'abcdefghi',
  name: 'Ada Lovelace',
  avatar: 'a1',
  banner: '',
  profile: '',
  style: { accent: '' },
}

// The requests the dialog makes, what the search finds, and New contact.
const calls = vi.hoisted(() => ({
  create: vi.fn(),
  invite: vi.fn(),
  accept: vi.fn(),
  information: vi.fn(),
  start: vi.fn(),
  results: [] as unknown[],
}))

beforeEach(() => {
  calls.create = vi.fn().mockResolvedValue({})
  calls.invite = vi.fn().mockResolvedValue({})
  calls.accept = vi.fn().mockResolvedValue({})
  calls.information = vi.fn().mockResolvedValue({})
  calls.start = vi.fn()
  calls.results = [person]
})

vi.mock('@/hooks/useContacts', () => ({
  useContactsQuery: () => ({ data: { contacts: [], received: [], sent: [] } }),
  useSearchDirectoryQuery: () => ({
    data: { results: calls.results },
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
  useAcceptFriendMutation: () => ({
    mutateAsync: calls.accept,
    isPending: false,
  }),
}))
vi.mock('@/api/person', () => ({
  personApi: { getInformation: (id: string) => calls.information(id) },
}))

function dialog(
  props: {
    book?: string
    link?: { contact: string; name: string }
    onNew?: () => void
  },
  open = true
) {
  return (
    <QueryClientProvider client={client}>
      <I18nProvider i18n={i18n}>
        <AddContactDialog open={open} onOpenChange={vi.fn()} {...props} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

const client = new QueryClient()

function show(props: {
  book?: string
  link?: { contact: string; name: string }
  onNew?: () => void
}) {
  return render(dialog(props))
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

  it('drops a profile that arrives after the dialog closed', async () => {
    let arrive: (information: unknown) => void = () => {}
    calls.information = vi.fn(
      () => new Promise((resolve) => (arrive = resolve))
    )
    const { rerender } = show({})
    await search()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    expect(calls.information).toHaveBeenCalledTimes(1)
    rerender(dialog({}, false))
    await act(async () => arrive(profile))
    rerender(dialog({}, true))
    expect(await screen.findByText('Add contact')).toBeInTheDocument()
    expect(screen.queryByText(/Preview Ada Lovelace/)).toBeNull()
    expect(calls.invite).not.toHaveBeenCalled()
  })

  it('describes the preview of an invitation being accepted as such', async () => {
    calls.results = [{ ...person, relationship: 'pending' }]
    calls.information = vi.fn().mockResolvedValue(profile)
    show({})
    await search()
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }))
    expect(
      await screen.findByText(
        "Preview Ada Lovelace's profile before accepting their friend invitation."
      )
    ).toBeInTheDocument()
  })

  it('describes the preview of an invitation being sent as such', async () => {
    calls.information = vi.fn().mockResolvedValue(profile)
    show({})
    await search()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    expect(
      await screen.findByText(
        "Preview Ada Lovelace's profile before sending a friend invitation."
      )
    ).toBeInTheDocument()
  })

  it("gives its buttons' icons no margin of their own", async () => {
    calls.results = [
      person,
      { ...person, id: 'p2', name: 'Grace Hopper', relationship: 'pending' },
    ]
    show({})
    await search()
    for (const icon of document.querySelectorAll('button svg'))
      expect(icon.getAttribute('class')).not.toMatch(/\bm[se]-2\b/)
  })

  it('starts a new contact where the list asks', () => {
    show({ book: 'b2', onNew: calls.start })
    fireEvent.click(screen.getByRole('button', { name: /New contact/ }))
    expect(calls.start).toHaveBeenCalledTimes(1)
  })

  it('offers no new contact while linking a card', () => {
    show({ link: { contact: 'c1', name: 'Ada Lovelace' } })
    expect(screen.queryByRole('button', { name: /New contact/ })).toBeNull()
  })
})
