// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactPanel } from './panel'

const idle = { isPending: false, mutateAsync: vi.fn() }

const queries = vi.hoisted(() => ({
  contact: {} as Record<string, unknown>,
  books: {} as Record<string, unknown>,
  // The contacts the merge list offers.
  contacts: [] as Record<string, unknown>[],
}))

// The requests a save, a create, a delete, an unfriend and a merge make.
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

vi.mock('@/hooks/useContacts', () => ({
  useContactQuery: () => queries.contact,
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
const failures = vi.hoisted(() => [] as unknown[])
const toasts = vi.hoisted(() => [] as { success?: unknown }[])
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
// A query the panel never enables, the contact query on a new contact.
const disabled = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}

const opened = vi.fn()
const closed = vi.fn()

function panel(id?: string, start?: string) {
  return (
    <I18nProvider i18n={i18n}>
      <ContactPanel id={id} book={start} onOpen={opened} onClose={closed} />
    </I18nProvider>
  )
}

function show(id?: string, start?: string) {
  if (!id) queries.contact = disabled
  return render(panel(id, start))
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

const name = () => screen.getByRole('textbox', { name: 'Name' })
const nickname = () => screen.getByRole('textbox', { name: 'Nickname' })

// One of the birthday's fields, by its name.
function field(label: 'Day' | 'Month' | 'Year') {
  return screen.getByRole(label === 'Month' ? 'combobox' : 'textbox', {
    name: label,
  })
}

// Choose an item in a select.
function choose(select: HTMLElement, item: string) {
  fireEvent.keyDown(select, { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name: item }))
}

// The updates sent, oldest first.
function updates() {
  return mutations.update.mutateAsync.mock.calls.map(
    (call) =>
      call[0] as {
        contact: string
        etag?: string
        source?: { id: string; etag?: string }
        properties?: { name: string; value: string }[]
        book?: string
      }
  )
}

// The properties of one name in the last update sent.
function saved(property: string) {
  const sent = updates()
  return (sent[sent.length - 1]?.properties ?? []).filter(
    (p) => p.name === property
  )
}

beforeEach(() => {
  queries.contact = loaded({ contact })
  queries.books = loaded({ books: [book] })
  queries.contacts = []
  mutations.create.mutateAsync = vi
    .fn()
    .mockResolvedValue({ contact: { ...contact, id: 'c9', etag: 'e9' } })
  mutations.update.mutateAsync = vi
    .fn()
    .mockResolvedValue({ contact: { ...contact, etag: 'e2' } })
  mutations.delete.mutateAsync = vi.fn().mockResolvedValue({})
  mutations.remove.mutateAsync = vi.fn().mockResolvedValue({})
  mutations.preview.mutateAsync = vi.fn()
  failures.length = 0
  toasts.length = 0
  opened.mockReset()
  closed.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ContactPanel', () => {
  it('opens in a side panel titled with the name, Copy, Merge and Delete in its header', () => {
    show('c1')
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument()
    for (const label of ['Copy', 'Merge', 'Delete contact', 'Close']) {
      expect(dialog).toContainElement(
        screen.getByRole('button', { name: label })
      )
    }
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('is titled with the name the list holds while the card loads', () => {
    queries.contact = loading
    queries.contacts = [contact]
    show('c1')
    expect(screen.getByRole('heading', { name: 'Ada' })).toBeInTheDocument()
  })

  it('saves a field when it is left, against the card it read', async () => {
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.focusOut(nickname())
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(updates()[0]).toMatchObject({ contact: 'c1', etag: 'e1', book: 'b1' })
    expect(saved('NICKNAME')).toEqual([
      { name: 'NICKNAME', params: {}, value: 'Countess' },
    ])
  })

  it('saves once typing rests for a second, and not before', () => {
    vi.useFakeTimers()
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Count' } })
    act(() => vi.advanceTimersByTime(900))
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    act(() => vi.advanceTimersByTime(900))
    expect(updates()).toHaveLength(0)
    act(() => vi.advanceTimersByTime(100))
    expect(updates()).toHaveLength(1)
    expect(saved('NICKNAME')[0].value).toBe('Countess')
  })

  it('saves nothing when a field is left unchanged', async () => {
    show('c1')
    fireEvent.focusOut(nickname())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(updates()).toHaveLength(0)
  })

  it('holds a change made during a save until it returns, then sends it with the etag it came back with', async () => {
    let finish: (value: unknown) => void = () => {}
    mutations.update.mutateAsync = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve))
      )
      .mockResolvedValue({ contact: { ...contact, etag: 'e3' } })
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Count' } })
    fireEvent.focusOut(nickname())
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.focusOut(nickname())
    expect(updates()).toHaveLength(1)
    await act(async () => finish({ contact: { ...contact, etag: 'e2' } }))
    await waitFor(() => expect(updates()).toHaveLength(2))
    expect(updates()[1].etag).toBe('e2')
    expect(saved('NICKNAME')[0].value).toBe('Countess')
  })

  it('does not save a contact left with no name, and says it needs one', async () => {
    show('c1')
    fireEvent.change(name(), { target: { value: ' ' } })
    fireEvent.focusOut(name())
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(updates()).toHaveLength(0)
  })

  it('saves another address book at once', async () => {
    queries.books = loaded({
      books: [book, { ...book, id: 'b2', name: 'Work', default: false }],
    })
    show('c1')
    choose(screen.getByRole('combobox', { name: 'Address book' }), 'Work')
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(updates()[0].book).toBe('b2')
  })

  it('reloads the card when a save is refused as changed elsewhere', async () => {
    const fresh = {
      ...contact,
      etag: 'e5',
      card: [{ name: 'FN', params: {}, value: 'Ada Byron' }],
    }
    const query = loaded({ contact })
    query.refetch = vi.fn().mockResolvedValue({ data: { contact: fresh } })
    queries.contact = query
    mutations.update.mutateAsync = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('changed'), { status: 412 }))
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.focusOut(nickname())
    await waitFor(() => expect(name()).toHaveValue('Ada Byron'))
    expect(nickname()).toHaveValue('')
    expect(failures).toHaveLength(1)
  })

  it('takes a newer card while nothing is edited', () => {
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
    view.rerender(panel('c1'))
    expect(nickname()).toHaveValue('Countess')
  })

  it('keeps what was typed when the friend switch changes only the etag, and saves against the new one', async () => {
    const view = show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    queries.contact = loaded({ contact: { ...contact, etag: 'e2' } })
    view.rerender(panel('c1'))
    expect(nickname()).toHaveValue('Countess')
    fireEvent.focusOut(nickname())
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(updates()[0].etag).toBe('e2')
  })

  it('keeps an edit when the card changes elsewhere, and saves it against the card it read', async () => {
    const view = show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    queries.contact = loaded({
      contact: {
        ...contact,
        etag: 'e2',
        card: [{ name: 'FN', params: {}, value: 'Ada Byron' }],
      },
    })
    view.rerender(panel('c1'))
    expect(nickname()).toHaveValue('Countess')
    fireEvent.focusOut(nickname())
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(updates()[0].etag).toBe('e1')
  })

  it('saves what was typed when it is closed', async () => {
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('saves what was typed when the next contact takes its place', async () => {
    const view = show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    view.unmount()
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(saved('NICKNAME')[0].value).toBe('Countess')
  })

  it('shows the address book a contact is in when the contact arrives before the books', async () => {
    queries.books = loading
    const view = show('c1')
    expect(
      screen.getByRole('combobox', { name: 'Address book' })
    ).toHaveTextContent('')
    queries.books = loaded({ books: [book] })
    view.rerender(panel('c1'))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
  })

  it('shows the address book when the contact arrives after the books', async () => {
    queries.contact = loading
    const view = show('c1')
    expect(screen.queryByRole('combobox', { name: 'Address book' })).toBeNull()
    queries.contact = loaded({ contact })
    view.rerender(panel('c1'))
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
    choose(field('Month'), 'October')
    fireEvent.focusOut(field('Day'))
    await waitFor(() => expect(saved('BDAY')).toHaveLength(1))
    expect(saved('BDAY')).toEqual([
      { name: 'BDAY', params: {}, value: '--1002' },
    ])
  })

  it('saves the other fields while the birthday is not yet a day, leaving the birthday it had', async () => {
    born('1985-04-12')
    show('c1')
    fireEvent.change(field('Day'), { target: { value: '31' } })
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.focusOut(nickname())
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(saved('BDAY')).toEqual([
      { name: 'BDAY', params: {}, value: '1985-04-12' },
    ])
    expect(saved('NICKNAME')[0].value).toBe('Countess')
  })

  it('does not save a birthday that is not a day', async () => {
    show('c1')
    fireEvent.change(field('Day'), { target: { value: '31' } })
    choose(field('Month'), 'April')
    fireEvent.focusOut(field('Day'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(updates()).toHaveLength(0)
    fireEvent.change(field('Day'), { target: { value: '30' } })
    fireEvent.focusOut(field('Day'))
    await waitFor(() => expect(updates()).toHaveLength(1))
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
    fireEvent.focusOut(field('Day'))
    await waitFor(() => expect(updates()).toHaveLength(1))
    expect(saved('BDAY')).toEqual([])
  })

  it('shows a birthday it cannot read as written, until it is cleared', async () => {
    born('circa 1800', { VALUE: ['text'] })
    show('c1')
    expect(screen.getByDisplayValue('circa 1800')).toHaveAttribute('readonly')
    expect(screen.queryByRole('textbox', { name: 'Day' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(field('Day')).toHaveValue('')
    fireEvent.focusOut(field('Day'))
    await waitFor(() => expect(updates()).toHaveLength(1))
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

  it('shows the friend switch above the name, and the details under a heading', () => {
    show('c1')
    const toggle = screen.getByRole('switch', { name: 'Mochi friend' })
    expect(
      toggle.compareDocumentPosition(name()) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Details' })).toBeInTheDocument()
  })

  it('offers the three add buttons on one line, and only the rows that exist', () => {
    show('c1')
    const buttons = ['Add email', 'Add telephone', 'Add address'].map((label) =>
      screen.getByRole('button', { name: label })
    )
    expect(new Set(buttons.map((button) => button.parentElement)).size).toBe(1)
    expect(screen.queryByRole('textbox', { name: 'Emails' })).toBeNull()
    fireEvent.click(buttons[1])
    expect(
      screen.getByRole('textbox', { name: 'Telephones' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Emails' })).toBeNull()
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
  })

  it('keeps the unfriend dialog open when the request fails', async () => {
    queries.contact = loaded({
      contact: { ...contact, person: 'p1', friend: true },
    })
    mutations.remove.mutateAsync = vi.fn().mockRejectedValue(new Error('down'))
    show('c1')
    fireEvent.click(screen.getByRole('switch', { name: 'Mochi friend' }))
    await screen.findByText(/End your friendship with/)
    fireEvent.click(screen.getByRole('button', { name: /Unfriend/ }))
    await waitFor(() =>
      expect(mutations.remove.mutateAsync).toHaveBeenCalledTimes(1)
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByText(/End your friendship with/)).toBeInTheDocument()
  })

  it('deletes the contact once confirmed, and closes', async () => {
    show('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Delete contact' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }))
    await waitFor(() => expect(closed).toHaveBeenCalledTimes(1))
    expect(mutations.delete.mutateAsync).toHaveBeenCalledWith({
      contact: 'c1',
    })
    expect(updates()).toHaveLength(0)
  })
})

describe('ContactPanel making a contact', () => {
  it('puts a new contact in the default book', async () => {
    show()
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
  })

  it('puts a new contact in the book it was started from', async () => {
    queries.books = loaded({
      books: [book, { ...book, id: 'b2', name: 'Work', default: false }],
    })
    show(undefined, 'b2')
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Work')
    )
  })

  it('has no friend switch, Copy, Merge or Delete, and saves nothing until Create', async () => {
    show()
    expect(screen.queryByRole('switch')).toBeNull()
    for (const label of ['Copy', 'Merge', 'Delete contact']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    fireEvent.change(name(), { target: { value: 'Grace' } })
    fireEvent.focusOut(name())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(updates()).toHaveLength(0)
    expect(mutations.create.mutateAsync).not.toHaveBeenCalled()
  })

  it('holds Create while the birthday is not a day', () => {
    show()
    fireEvent.change(name(), { target: { value: 'Grace' } })
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    fireEvent.change(field('Day'), { target: { value: '31' } })
    choose(field('Month'), 'April')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  it('creates the contact with Create and then follows it', async () => {
    show()
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Address book' })
      ).toHaveTextContent('Contacts')
    )
    fireEvent.change(name(), { target: { value: 'Grace' } })
    fireEvent.change(nickname(), { target: { value: 'Amazing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('c9'))
    const request = mutations.create.mutateAsync.mock.calls[0][0] as {
      properties: { name: string; value: string }[]
      book: string
      source?: string
    }
    expect(request.book).toBe('b1')
    expect(request.source).toBeUndefined()
    expect(request.properties.map((p) => [p.name, p.value])).toEqual([
      ['FN', 'Grace'],
      ['NICKNAME', 'Amazing'],
    ])
  })
})

describe('ContactPanel copying', () => {
  it('makes the copy at once from the card as it stands, and opens it', async () => {
    show('c1')
    fireEvent.change(nickname(), { target: { value: 'Countess' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('c9'))
    const request = mutations.create.mutateAsync.mock.calls[0][0] as {
      properties: { name: string; value: string }[]
      book: string
      source?: string
    }
    expect(request.source).toBe('c1')
    expect(request.book).toBe('b1')
    expect(request.properties.map((p) => p.value)).toEqual(['Ada', 'Countess'])
    expect(toasts.some((toast) => toast.success === 'Contact copied')).toBe(
      true
    )
  })
})

describe('ContactPanel merging', () => {
  // The opened card is plain; the one picked is linked to a Mochi person, so
  // it survives and the opened one is absorbed into it.
  const linked = {
    ...contact,
    id: 'c2',
    person: 'p1',
    name: 'Ada Byron',
    etag: 'e7',
  }

  function merge() {
    queries.contacts = [contact, linked]
    mutations.preview.mutateAsync = vi
      .fn()
      .mockResolvedValue({ contact: linked, source: contact })
    show('c1')
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
  }

  it('offers every other contact, not the one open', async () => {
    merge()
    const list = await screen.findByRole('dialog', { name: 'Merge contacts' })
    expect(list).toHaveTextContent('Ada Byron')
    expect(
      [...list.querySelectorAll('li')].map((item) => item.textContent)
    ).toEqual(['Ada Byron'])
  })

  it('merges the contact picked at once, letting the server combine the cards, and follows the survivor', async () => {
    merge()
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Byron' }))
    await waitFor(() => expect(opened).toHaveBeenCalledWith('c2'))
    expect(mutations.preview.mutateAsync).toHaveBeenCalledWith({
      contact: 'c1',
      source: 'c2',
    })
    expect(updates()).toEqual([
      { contact: 'c2', etag: 'e7', source: { id: 'c1', etag: 'e1' } },
    ])
  })

  it('stays on the contact and says why when the merge is refused', async () => {
    merge()
    mutations.preview.mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error('Both contacts are linked'))
    fireEvent.click(await screen.findByRole('button', { name: 'Ada Byron' }))
    await waitFor(() => expect(failures).toHaveLength(1))
    expect(opened).not.toHaveBeenCalled()
    expect(updates()).toHaveLength(0)
  })
})
