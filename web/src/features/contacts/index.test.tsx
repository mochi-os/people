// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Contacts } from './index'

const contact = {
  id: 'c1',
  book: 'b1',
  person: 'p1',
  friend: true,
  name: 'Ada Lovelace',
  directory: '',
  created: 0,
  updated: 0,
}

// A person who is not yet a friend, whose menu offers Invite.
const stranger = {
  ...contact,
  id: 'c2',
  person: 'p2',
  friend: false,
  name: 'Grace Hopper',
}

const idle = vi.hoisted(() => () => ({
  mutateAsync: vi.fn(),
  isPending: false,
}))

vi.mock('@/hooks/useContacts', () => ({
  useContactsQuery: () => ({
    data: { contacts: [contact, stranger], received: [], sent: [] },
    contacts: [contact, stranger],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBooksQuery: () => ({ data: { books: [] } }),
  useDeleteContactMutation: idle,
  useInviteFriendMutation: idle,
  useRemoveFriendMutation: idle,
}))
vi.mock('./add-dialog', () => ({ AddContactDialog: () => null }))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <Contacts />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('Contacts', () => {
  beforeEach(() => {
    navigate.mockReset()
  })

  it('opens a contact from a click anywhere on its row', () => {
    show()
    fireEvent.click(screen.getByText('Grace Hopper'))
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id',
      params: { id: 'c2' },
    })
  })

  it("opens a contact once from its name, the keyboard's way in", () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id',
      params: { id: 'c2' },
    })
  })

  it('offers no Edit, on the row or in its menu', () => {
    show()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Actions for Grace Hopper' }),
      { key: 'Enter' }
    )
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
  })

  it("keeps a click in a row's menu from opening the contact", async () => {
    show()
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Actions for Grace Hopper' }),
      { key: 'Enter' }
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(navigate).not.toHaveBeenCalled()
    expect(await screen.findByText('Delete contact')).toBeInTheDocument()
  })

  it('labels neither a friend nor a person on Mochi beside their name', () => {
    show()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Friend')).toBeNull()
    expect(screen.queryByText('On Mochi')).toBeNull()
  })

  it("gives a contact's menu icons no margin of their own", () => {
    show()
    for (const name of ['Ada Lovelace', 'Grace Hopper']) {
      fireEvent.keyDown(
        screen.getByRole('button', { name: `Actions for ${name}` }),
        { key: 'Enter' }
      )
      const items = screen.getAllByRole('menuitem')
      expect(items.length).toBeGreaterThan(1)
      for (const item of items)
        expect(item.querySelector('svg')?.getAttribute('class')).not.toMatch(
          /\bm[se]-2\b/
        )
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    }
  })
})
