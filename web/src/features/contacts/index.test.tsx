// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
// The add dialog offers New contact, which is all the list asks of it.
vi.mock('./add-dialog', () => ({
  AddContactDialog: (props: { open: boolean; onNew?: () => void }) =>
    props.open ? (
      <button type='button' onClick={props.onNew}>
        New contact
      </button>
    ) : null,
}))
// The panel, standing in as the contact it shows and its close.
vi.mock('./panel', () => ({
  ContactPanel: (props: { id?: string; onClose: () => void }) => (
    <div data-testid='panel'>
      {props.id ?? 'new'}
      <button type='button' onClick={props.onClose}>
        Close panel
      </button>
    </div>
  ),
}))
// One router, as the app has, so the effect that writes the URL runs only
// when what it names changes.
const router = vi.hoisted(() => ({ history: {} }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => router }))

function show(props: { open?: string } = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <Contacts {...props} />
      </I18nProvider>
    </QueryClientProvider>
  )
}

const shown = () => screen.queryByTestId('panel')?.firstChild?.textContent
// The paths the URL was replaced with.
const replaced = () =>
  vi.mocked(window.history.replaceState).mock.calls.map((call) => call[2])

describe('Contacts', () => {
  beforeEach(() => {
    // Each test starts at the list's own address, which the app path is read
    // from.
    window.history.replaceState(null, '', '/')
    vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens a contact in the side panel from a click anywhere on its row, naming it in the URL', () => {
    show()
    expect(shown()).toBeUndefined()
    fireEvent.click(screen.getByText('Grace Hopper'))
    expect(shown()).toBe('c2')
    expect(replaced()).toEqual(['/contacts/c2'])
  })

  it("opens a contact from its name, the keyboard's way in", () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }))
    expect(shown()).toBe('c2')
  })

  it("puts the list's own address back when the panel closes", () => {
    show()
    fireEvent.click(screen.getByText('Grace Hopper'))
    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(shown()).toBeUndefined()
    expect(replaced()).toEqual(['/contacts/c2', '/'])
  })

  it('opens the contact a link names, leaving the address as it is', () => {
    show({ open: 'c1' })
    expect(shown()).toBe('c1')
    expect(replaced()).toEqual([])
  })

  it('steps to the next and previous contact with the arrow keys while one is open', () => {
    show()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(shown()).toBeUndefined()
    fireEvent.click(screen.getByText('Ada Lovelace'))
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(shown()).toBe('c2')
    fireEvent.keyDown(document.body, { key: 'k' })
    expect(shown()).toBe('c1')
  })

  it('opens a new contact in the panel from the add dialog', () => {
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Add contact' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'New contact' }))
    expect(shown()).toBe('new')
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
    expect(await screen.findByText('Delete contact')).toBeInTheDocument()
    expect(shown()).toBeUndefined()
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
