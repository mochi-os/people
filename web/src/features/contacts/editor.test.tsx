// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@lingui/react'
import { i18n } from '@lingui/core'
import { ContactEditor } from './editor'

const idle = { isPending: false, mutateAsync: vi.fn() }

const queries = vi.hoisted(() => ({
  contact: {} as Record<string, unknown>,
  books: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useContacts', () => ({
  useContactQuery: () => queries.contact,
  useBooksQuery: () => queries.books,
  useContactsQuery: () => ({ data: { contacts: [], received: [], sent: [] } }),
  useInviteFriendMutation: () => idle,
  useRemoveFriendMutation: () => idle,
  useCreateContactMutation: () => idle,
  useDeleteContactMutation: () => idle,
  useUpdateContactMutation: () => idle,
}))
vi.mock('./add-dialog', () => ({ AddContactDialog: () => null }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const book = {
  id: 'b1',
  fingerprint: 'f1',
  name: 'Contacts',
  count: 1,
  default: true,
  version: 1,
  created: 0,
  updated: 0,
}

const contact = {
  id: 'c1',
  book: 'b1',
  person: '',
  friend: false,
  name: 'Ada',
  directory: '',
  created: 0,
  updated: 0,
  card: [{ name: 'FN', params: {}, value: 'Ada' }],
  etag: 'e1',
}

const loaded = <T,>(data: T) => ({
  data,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
})
const loading = { data: undefined, isLoading: true, error: null, refetch: vi.fn() }
// A query the editor never enables, the contact query on a new contact.
const disabled = { data: undefined, isLoading: false, error: null, refetch: vi.fn() }

function show(id?: string) {
  if (!id) queries.contact = disabled
  return render(
    <I18nProvider i18n={i18n}>
      <ContactEditor id={id} />
    </I18nProvider>
  )
}

beforeEach(() => {
  queries.contact = loaded({ contact })
  queries.books = loaded({ books: [book] })
})

describe('ContactEditor', () => {
  it('shows the address book a contact is in when the contact arrives before the books', async () => {
    queries.books = loading
    const { rerender } = show('c1')
    // The select is mounted with the book set and no item to show for it.
    expect(
      screen.getByRole('combobox', { name: 'Address book' })
    ).toHaveTextContent('')

    queries.books = loaded({ books: [book] })
    rerender(
      <I18nProvider i18n={i18n}>
        <ContactEditor id='c1' />
      </I18nProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
  })

  it('shows the address book when the contact arrives after the books', async () => {
    queries.contact = loading
    const { rerender } = show('c1')
    expect(screen.queryByRole('combobox', { name: 'Address book' })).toBeNull()

    queries.contact = loaded({ contact })
    rerender(
      <I18nProvider i18n={i18n}>
        <ContactEditor id='c1' />
      </I18nProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
  })

  it('puts a new contact in the default book', async () => {
    show()
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
  })

  it('puts the friend switch in the page header and the details under a heading', () => {
    show('c1')
    expect(screen.getByRole('heading', { name: 'Details' })).toBeInTheDocument()
    for (const title of ['Name', 'Emails', 'Telephones', 'Addresses']) {
      expect(screen.queryByRole('heading', { name: title })).toBeNull()
    }
    // The header holds one copy of its actions per breakpoint.
    const toggles = screen.getAllByRole('switch', { name: /Mochi friend/ })
    expect(toggles.length).toBeGreaterThan(0)
    for (const toggle of toggles) {
      expect(screen.getByRole('banner')).toContainElement(toggle)
    }
  })

  it('offers the three add buttons on one line, and only the rows that exist', () => {
    show('c1')
    const buttons = ['Add email', 'Add telephone', 'Add address'].map((label) =>
      screen.getByRole('button', { name: label })
    )
    expect(new Set(buttons.map((button) => button.parentElement)).size).toBe(1)
    expect(screen.queryByRole('textbox', { name: 'Emails' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Telephones' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Street' })).toBeNull()

    fireEvent.click(buttons[1])
    expect(screen.getByRole('textbox', { name: 'Telephones' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Emails' })).toBeNull()
    expect(buttons[1].closest('section')).toBe(
      screen.getByRole('textbox', { name: 'Telephones' }).closest('section')
    )
  })

  it('keeps the address book at the head of the details, before the birthday', () => {
    show('c1')
    const select = screen.getByRole('combobox', { name: 'Address book' })
    const birthday = screen.getByRole('textbox', { name: 'Birthday' })
    expect(
      select.compareDocumentPosition(birthday) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(select.closest('section')).toBe(birthday.closest('section'))
    expect(select.closest('section')).toContainElement(
      screen.getByRole('heading', { name: 'Details' })
    )
  })

  it('has no friend switch on a new contact', () => {
    show()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
