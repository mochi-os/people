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
  // The contacts the merge list offers.
  contacts: [] as Record<string, unknown>[],
  // Whether the editor last asked for the contact to be fetched.
  enabled: undefined as boolean | undefined,
}))

// The requests a save, a delete and an unfriend make.
const mutations = vi.hoisted(() => ({
  create: { isPending: false, mutateAsync: vi.fn() },
  update: { isPending: false, mutateAsync: vi.fn() },
  delete: { isPending: false, mutateAsync: vi.fn() },
  remove: { isPending: false, mutateAsync: vi.fn() },
  preview: {
    isPending: false,
    variables: undefined as unknown,
    mutateAsync: vi.fn(),
  },
}))

type Block = (locations: {
  current: { pathname: string }
  next: { pathname: string }
}) => boolean

const away = {
  current: { pathname: '/contacts/c1' },
  next: { pathname: '/' },
}

// The router's blocker as the editor registers it, and whether each
// navigation the editor makes would have been held at the moment it was made.
const router = vi.hoisted(() => ({
  block: null as Block | null,
  blocked: false,
  proceed: vi.fn(),
  reset: vi.fn(),
  navigate: vi.fn(),
  held: [] as boolean[],
}))

vi.mock('@/hooks/useContacts', () => ({
  useContactQuery: (_: string, options?: { enabled?: boolean }) => {
    queries.enabled = options?.enabled
    return queries.contact
  },
  useBooksQuery: () => queries.books,
  useContactsQuery: () => ({
    data: { contacts: queries.contacts, received: [], sent: [] },
  }),
  useInviteFriendMutation: () => idle,
  useRemoveFriendMutation: () => mutations.remove,
  useCreateContactMutation: () => mutations.create,
  useDeleteContactMutation: () => mutations.delete,
  useUpdateContactMutation: () => mutations.update,
  useMergePreviewMutation: () => mutations.preview,
}))
vi.mock('./add-dialog', () => ({ AddContactDialog: () => null }))
// The messages each save shows, as the editor hands them to the toast.
const toasts = vi.hoisted(() => [] as { success?: unknown }[])
const failures = vi.hoisted(() => [] as unknown[])
vi.mock('@mochi/web', async (actual) => {
  const real = await actual<typeof import('@mochi/web')>()
  return {
    ...real,
    toast: {
      ...real.toast,
      error: (message: unknown) => failures.push(message),
    },
    toastAction: (
      promise: Promise<unknown>,
      messages: { success?: unknown }
    ) => {
      toasts.push(messages)
      return promise
    },
  }
})
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => (options: unknown) => {
    router.held.push(router.block!(away))
    router.navigate(options)
  },
  useBlocker: (options: { shouldBlockFn: Block }) => {
    router.block = options.shouldBlockFn
    return router.blocked
      ? { status: 'blocked', proceed: router.proceed, reset: router.reset }
      : { status: 'idle' }
  },
}))

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

// Give the contact a birthday as stored.
function born(value: string, params: Record<string, string[]> = {}) {
  queries.contact = loaded({
    contact: {
      ...contact,
      card: [...contact.card, { name: 'BDAY', params, value }],
    },
  })
}

// One of the birthday's fields, by its name.
function field(name: 'Day' | 'Month' | 'Year') {
  return screen.getByRole(name === 'Month' ? 'combobox' : 'textbox', { name })
}

// Choose a month in the birthday's month list.
function pick(month: string) {
  fireEvent.keyDown(field('Month'), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name: month }))
}

// The properties of one name in the last update sent.
function saved(name: string) {
  const calls = mutations.update.mutateAsync.mock.calls
  const call = calls[calls.length - 1]?.[0] as {
    properties: { name: string }[]
  }
  return call.properties.filter((property) => property.name === name)
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
  mutations.create.mutateAsync = vi.fn().mockResolvedValue({ contact })
  mutations.update.mutateAsync = vi.fn().mockResolvedValue({ contact })
  mutations.delete.mutateAsync = vi.fn().mockResolvedValue({})
  mutations.remove.mutateAsync = vi.fn().mockResolvedValue({})
  mutations.preview.mutateAsync = vi.fn()
  queries.contacts = []
  failures.length = 0
  router.block = null
  router.blocked = false
  router.proceed.mockReset()
  router.reset.mockReset()
  router.navigate.mockReset()
  router.held = []
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
    born('19850412')
    show('c1')
    expect(field('Day')).toHaveValue('12')
    expect(field('Month')).toHaveTextContent('April')
    expect(field('Year')).toHaveValue('1985')
  })

  it('opens a contact whose birthday has no year with the year left empty', () => {
    born('--04-12')
    show('c1')
    expect(field('Day')).toHaveValue('12')
    expect(field('Month')).toHaveTextContent('April')
    expect(field('Year')).toHaveValue('')
  })

  it('saves a birthday entered without its year', async () => {
    show('c1')
    fireEvent.change(field('Day'), { target: { value: '2' } })
    pick('October')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(saved('BDAY')).toEqual([
      { name: 'BDAY', params: {}, value: '--1002' },
    ])
  })

  it('holds Save, and Enter, while the birthday is not a day', async () => {
    show('c1')
    fireEvent.change(field('Day'), { target: { value: '31' } })
    pick('April')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.submit(field('Day').closest('form')!)
    fireEvent.change(field('Day'), { target: { value: '30' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(mutations.update.mutateAsync).not.toHaveBeenCalled()
  })

  it('keeps the day as typed while the birthday it makes comes back', () => {
    born('--04-12')
    show('c1')
    fireEvent.change(field('Day'), { target: { value: '05' } })
    expect(field('Day')).toHaveValue('05')
  })

  it('removes a birthday with Clear', async () => {
    born('1985-04-12')
    show('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(field('Day')).toHaveValue('')
    expect(field('Year')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(saved('BDAY')).toEqual([])
  })

  it('shows a birthday it cannot read as written, until it is cleared', async () => {
    born('circa 1800', { VALUE: ['text'] })
    show('c1')
    expect(screen.getByDisplayValue('circa 1800')).toHaveAttribute('readonly')
    expect(screen.queryByRole('textbox', { name: 'Day' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(field('Day')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(saved('BDAY')).toEqual([])
  })

  it('orders the birthday fields as the date format writes a date', () => {
    show('c1')
    const group = screen.getByRole('group', { name: 'Birthday' })
    const parts = [field('Year'), field('Month'), field('Day')]
    for (const part of parts) expect(group).toContainElement(part)
    for (let index = 1; index < parts.length; index++) {
      expect(
        parts[index - 1].compareDocumentPosition(parts[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
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
    const birthday = screen.getByRole('group', { name: 'Birthday' })
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

  it('takes a newer card while nothing is edited, as when the one shown first was kept from an earlier visit', async () => {
    const view = show('c1')
    queries.contact = loaded({
      contact: {
        ...contact,
        etag: 'e2',
        card: [
          { name: 'FN', params: {}, value: 'Ada' },
          { name: 'NICKNAME', params: {}, value: 'Countess' },
        ],
      },
    })
    view.rerender(again('c1'))
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toHaveValue(
      'Countess'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(mutations.update.mutateAsync.mock.calls[0][0]).toMatchObject({
      etag: 'e2',
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

describe('ContactEditor copying', () => {
  const name = () => screen.getByRole('textbox', { name: 'Name' })
  const copy = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

  // The create request the copy's Save sent.
  function created() {
    const calls = mutations.create.mutateAsync.mock.calls
    return calls[calls.length - 1]?.[0] as {
      properties: { name: string; value: string }[]
      book: string
      source?: string
    }
  }

  it('saves a copy as a new contact in the same book, made from the original', async () => {
    queries.contact = loaded({
      contact: {
        ...contact,
        card: [
          ...contact.card,
          { name: 'EMAIL', params: {}, value: 'ada@example.com' },
        ],
      },
    })
    show('c1')
    copy()
    expect(screen.getAllByText('Copy contact').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(mutations.update.mutateAsync).not.toHaveBeenCalled()
    expect(toasts[toasts.length - 1]?.success).toBe('Contact copied')
    const sent = created()
    expect(sent.source).toBe('c1')
    expect(sent.book).toBe('b1')
    expect(sent.properties).toContainEqual(
      expect.objectContaining({ name: 'FN', value: 'Ada' })
    )
    expect(sent.properties).toContainEqual(
      expect.objectContaining({ name: 'EMAIL', value: 'ada@example.com' })
    )
  })

  it('carries edits not yet saved into the copy', async () => {
    show('c1')
    fireEvent.change(name(), { target: { value: 'Ada Lovelace' } })
    copy()
    expect(name()).toHaveValue('Ada Lovelace')
    await waitFor(() => expect(name()).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(created().properties).toContainEqual(
      expect.objectContaining({ name: 'FN', value: 'Ada Lovelace' })
    )
  })

  it('stops following the original once copied', () => {
    show('c1')
    expect(queries.enabled).toBe(true)
    copy()
    expect(queries.enabled).toBe(false)
  })

  it('offers no friend switch, Delete or second Copy on a copy', () => {
    show('c1')
    copy()
    expect(screen.queryAllByRole('switch', { name: /Mochi friend/ })).toEqual(
      []
    )
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('holds a link away from a copy that carries an edit, and not from an untouched one', () => {
    show('c1')
    copy()
    expect(router.block!(away)).toBe(false)
    fireEvent.change(name(), { target: { value: 'Ada King' } })
    expect(router.block!(away)).toBe(true)
  })
})

describe('ContactEditor leaving', () => {
  const name = () => screen.getByRole('textbox', { name: 'Name' })

  it('lets a link away through while nothing is edited', () => {
    show('c1')
    expect(router.block!(away)).toBe(false)
  })

  it('holds a link away while an edit is unsaved', () => {
    show('c1')
    fireEvent.change(name(), { target: { value: 'Ada King' } })
    expect(router.block!(away)).toBe(true)
    fireEvent.change(name(), { target: { value: 'Ada' } })
    expect(router.block!(away)).toBe(false)
  })

  it('asks before Cancel drops an edit', () => {
    show('c1')
    fireEvent.change(name(), { target: { value: 'Ada King' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(router.held).toEqual([true])
  })

  it('does not hold a new contact with nothing filled', async () => {
    show()
    // The default book is chosen for it, which is not an edit.
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
    expect(router.block!(away)).toBe(false)
  })

  it('holds a new contact once a field is filled', () => {
    show()
    fireEvent.change(screen.getByRole('textbox', { name: 'Nickname' }), {
      target: { value: 'Countess' },
    })
    expect(router.block!(away)).toBe(true)
  })

  it('leaves without asking after a save', async () => {
    show('c1')
    fireEvent.change(name(), { target: { value: 'Ada King' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1))
    expect(router.held).toEqual([false])
  })

  it('leaves without asking after a new contact is created', async () => {
    show()
    fireEvent.change(name(), { target: { value: 'Grace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1))
    expect(mutations.create.mutateAsync).toHaveBeenCalledTimes(1)
    expect(router.held).toEqual([false])
  })

  it('leaves without asking after a delete', async () => {
    show('c1')
    fireEvent.change(name(), { target: { value: 'Ada King' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1))
    expect(router.held).toEqual([false])
  })

  it('leaves once the edit is discarded', () => {
    router.blocked = true
    show('c1')
    expect(screen.getByText('Discard changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(router.proceed).toHaveBeenCalledTimes(1)
  })
})

describe('ContactEditor merging', () => {
  // The opened card is plain; the one picked is linked to a Mochi person, so
  // it survives and the opened one is absorbed into it.
  const linked = {
    ...contact,
    id: 'c2',
    person: 'p1',
    name: 'Ada Byron',
    etag: 'e2',
  }
  const merged = {
    ...linked,
    card: [
      { name: 'FN', params: {}, value: 'Ada Byron' },
      { name: 'EMAIL', params: {}, value: 'ada@example.com' },
      { name: 'EMAIL', params: {}, value: 'byron@example.com' },
    ],
  }
  const name = () => screen.getByRole('textbox', { name: 'Name' })
  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))

  // The update the merge's Save sent.
  function sent() {
    const calls = mutations.update.mutateAsync.mock.calls
    return calls[calls.length - 1]?.[0] as {
      contact: string
      etag?: string
      source?: { id: string; etag?: string }
      properties: { name: string; value: string }[]
      book: string
    }
  }

  async function merge() {
    queries.contacts = [contact, linked]
    mutations.preview.mutateAsync = vi
      .fn()
      .mockResolvedValue({ contact: merged, source: contact })
    show('c1')
    open()
    fireEvent.click(await screen.findByRole('button', { name: /Ada Byron/ }))
    await waitFor(() => expect(name()).toHaveValue('Ada Byron'))
  }

  it('offers every other contact, not the one being edited', async () => {
    queries.contacts = [contact, linked]
    show('c1')
    open()
    expect(
      await screen.findByRole('button', { name: /Ada Byron/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ada$/ })).toBeNull()
  })

  it('fills the form with the merged card of the contact that survives', async () => {
    await merge()
    expect(mutations.preview.mutateAsync).toHaveBeenCalledWith({
      contact: 'c1',
      source: 'c2',
    })
    expect(screen.getAllByText('Merge contacts').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('byron@example.com').length).toBe(1)
  })

  it('saves the merge into the survivor, naming the contact it absorbs', async () => {
    await merge()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mutations.update.mutateAsync).toHaveBeenCalledTimes(1)
    )
    expect(mutations.create.mutateAsync).not.toHaveBeenCalled()
    const request = sent()
    expect(request.contact).toBe('c2')
    expect(request.etag).toBe('e2')
    expect(request.source).toEqual({ id: 'c1', etag: 'e1' })
    expect(request.book).toBe('b1')
    expect(request.properties).toContainEqual(
      expect.objectContaining({ name: 'EMAIL', value: 'byron@example.com' })
    )
    expect(toasts[toasts.length - 1]?.success).toBe('Contacts merged')
  })

  it('offers no friend switch, Delete, Copy or second Merge while merging', async () => {
    await merge()
    expect(screen.queryAllByRole('switch', { name: /Mochi friend/ })).toEqual(
      []
    )
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
  })

  it('stops following the opened contact, which the merge may delete', async () => {
    await merge()
    expect(queries.enabled).toBe(false)
  })

  it('holds a link away from a merge not yet saved', async () => {
    await merge()
    expect(router.block!(away)).toBe(true)
  })

  it('stays on the contact and says why when the merge is refused', async () => {
    queries.contacts = [contact, linked]
    mutations.preview.mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error('Both contacts are linked'))
    show('c1')
    open()
    fireEvent.click(await screen.findByRole('button', { name: /Ada Byron/ }))
    await waitFor(() => expect(failures).toEqual(['Both contacts are linked']))
    expect(screen.getAllByText('Edit contact').length).toBeGreaterThan(0)
    // The list stays open to pick another; the form behind it is untouched.
    expect(screen.getByRole('button', { name: /Ada Byron/ })).toBeEnabled()
    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument()
  })

  it('drops the merge and reloads when a card changed since it was read', async () => {
    await merge()
    mutations.update.mutateAsync = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('changed'), { status: 412 }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(screen.getAllByText('Edit contact').length).toBeGreaterThan(0)
    )
    expect(queries.enabled).toBe(true)
  })
})
