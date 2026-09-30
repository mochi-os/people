// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactEditor } from './editor'

const idle = { isPending: false, mutateAsync: vi.fn() }

const queries = vi.hoisted(() => ({
  contact: {} as Record<string, unknown>,
  books: {} as Record<string, unknown>,
}))

// The requests a save and an unfriend make.
const mutations = vi.hoisted(() => ({
  update: { isPending: false, mutateAsync: vi.fn() },
  remove: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock('@/hooks/useContacts', () => ({
  useContactQuery: () => queries.contact,
  useBooksQuery: () => queries.books,
  useContactsQuery: () => ({ data: { contacts: [], received: [], sent: [] } }),
  useInviteFriendMutation: () => idle,
  useRemoveFriendMutation: () => mutations.remove,
  useCreateContactMutation: () => idle,
  useDeleteContactMutation: () => idle,
  useUpdateContactMutation: () => mutations.update,
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
const loading = {
  data: undefined,
  isLoading: true,
  error: null,
  refetch: vi.fn(),
}
// A query the editor never enables, the contact query on a new contact.
const disabled = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}

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
  mutations.update.mutateAsync = vi.fn().mockResolvedValue({ contact })
  mutations.remove.mutateAsync = vi.fn().mockResolvedValue({})
})

function again(id?: string, start?: string) {
  return (
    <I18nProvider i18n={i18n}>
      <ContactEditor id={id} book={start} />
    </I18nProvider>
  )
}

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

  it('opens a contact whose birthday is in the basic form', () => {
    queries.contact = loaded({
      contact: {
        ...contact,
        card: [
          ...contact.card,
          { name: 'BDAY', params: {}, value: '19850412' },
        ],
      },
    })
    show('c1')
    expect(screen.getByRole('textbox', { name: 'Birthday' })).toHaveValue(
      '1985-04-12'
    )
  })

  it('opens a contact whose birthday has no year and shows it as written', () => {
    queries.contact = loaded({
      contact: {
        ...contact,
        card: [...contact.card, { name: 'BDAY', params: {}, value: '--04-12' }],
      },
    })
    show('c1')
    expect(screen.getByRole('textbox', { name: 'Birthday' })).toHaveValue(
      '--04-12'
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
    expect(
      screen.getByRole('textbox', { name: 'Telephones' })
    ).toBeInTheDocument()
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
      select.compareDocumentPosition(birthday) &
        Node.DOCUMENT_POSITION_FOLLOWING
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

  it('saves a URL a phone stored without its scheme', async () => {
    queries.contact = loaded({
      contact: {
        ...contact,
        card: [
          ...contact.card,
          { name: 'URL', params: {}, value: 'www.example.com' },
        ],
      },
    })
    show('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
  })

  it('keeps what was typed when the friend switch changes the etag', async () => {
    const view = show('c1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Ada King' },
    })
    queries.contact = loaded({ contact: { ...contact, etag: 'e2' } })
    view.rerender(again('c1'))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Ada King'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(mutations.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      etag: 'e2',
    })
  })

  it('saves against the card it read when the card changed elsewhere', async () => {
    const view = show('c1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Ada King' },
    })
    queries.contact = loaded({
      contact: {
        ...contact,
        etag: 'e2',
        card: [{ name: 'FN', params: {}, value: 'Ada Byron' }],
      },
    })
    view.rerender(again('c1'))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Ada King'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(mutations.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      etag: 'e1',
    })
  })

  it('keeps the unfriend dialog open when the request fails', async () => {
    queries.contact = loaded({
      contact: { ...contact, person: 'p1', friend: true },
    })
    mutations.remove.mutateAsync = vi.fn().mockRejectedValue(new Error('down'))
    show('c1')
    fireEvent.click(screen.getAllByRole('switch', { name: /Mochi friend/ })[0])
    await screen.findByText(/End your friendship with/)
    fireEvent.click(screen.getByRole('button', { name: /Unfriend/ }))
    await waitFor(() =>
      expect(mutations.remove.mutateAsync).toHaveBeenCalledTimes(1)
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByText(/End your friendship with/)).toBeInTheDocument()
  })

  it('puts a new contact in the book it was started from', async () => {
    queries.books = loaded({
      books: [book, { ...book, id: 'b2', name: 'Work', default: false }],
    })
    queries.contact = disabled
    render(again(undefined, 'b2'))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Work')
    )
  })
})
