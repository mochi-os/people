// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

describe('Contacts', () => {
  it("gives a contact's menu icons no margin of their own", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider i18n={i18n}>
          <Contacts />
        </I18nProvider>
      </QueryClientProvider>
    )
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
