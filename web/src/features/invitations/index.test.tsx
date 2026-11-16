// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetContactsResponse, Received } from '@/api/types/contacts'
import { Invitations } from './index'

const state = vi.hoisted(() => ({
  received: [] as Received[],
  sent: [] as GetContactsResponse['sent'],
  accept: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  toast: state.toast,
  // A formatter that shows it was used, whatever the test's locale.
  useFormat: () => ({ formatNumber: (value: number) => `#${value}` }),
}))
vi.mock('@/hooks/useContacts', () => ({
  useContactsQuery: () => ({
    data: { contacts: [], received: state.received, sent: state.sent },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAcceptFriendMutation: () => ({
    mutateAsync: state.accept,
    isPending: false,
  }),
  useIgnoreFriendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveFriendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/add-dialog', () => ({
  AddContactDialog: () => null,
}))
vi.mock('./invite-settings-dialog', () => ({
  InviteSettingsDialog: () => null,
}))

function invite(fields: Partial<Received>): Received {
  return {
    identity: 'me',
    id: 'p1',
    direction: 'from',
    name: 'Ada',
    updated: 0,
    fingerprint: 'abcdefghi',
    directory: 'Ada',
    ...fields,
  }
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <Invitations />
      </I18nProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  state.received = []
  state.sent = []
  state.accept = vi.fn().mockResolvedValue({})
  state.toast.success = vi.fn()
  state.toast.error = vi.fn()
})

describe('Invitations', () => {
  it("shows a received invite's fingerprint under the name it claims", () => {
    state.received = [invite({})]
    show()
    expect(screen.getByText('abc-def-ghi')).toBeInTheDocument()
    expect(screen.queryByText(/Listed as/)).toBeNull()
  })

  it("names the directory's entry when it differs from the claimed name", () => {
    state.received = [invite({ directory: 'Mallory' })]
    show()
    expect(
      screen.getByText('abc-def-ghi · Listed as Mallory')
    ).toBeInTheDocument()
  })

  it('says nothing of the directory for a sender it does not list', () => {
    state.received = [invite({ directory: '' })]
    show()
    expect(screen.getByText('abc-def-ghi')).toBeInTheDocument()
    expect(screen.queryByText(/Listed as/)).toBeNull()
  })

  it('shows a request on XMPP by its address, with no fingerprint', () => {
    state.received = [
      invite({
        id: 'xmpp:dave@example.org',
        name: 'Dave',
        address: 'dave@example.org',
        account: 'x1',
        fingerprint: '',
        directory: '',
      }),
    ]
    show()
    expect(screen.getByText('Dave')).toBeInTheDocument()
    expect(screen.getByText('dave@example.org')).toBeInTheDocument()
    expect(screen.queryByText(/Listed as/)).toBeNull()
  })

  it('accepts a request on XMPP by its address', async () => {
    state.received = [
      invite({ id: 'xmpp:dave@example.org', name: 'Dave', address: 'dave@example.org' }),
    ]
    show()
    fireEvent.click(screen.getByRole('button', { name: /^Accept$/ }))
    await waitFor(() =>
      expect(state.accept).toHaveBeenCalledWith({
        person: 'xmpp:dave@example.org',
      })
    )
  })

  // jsdom lays nothing out, so the row's flex contract is what can be held:
  // the name block takes the spare width and may shrink below its text, so
  // `truncate` cuts a long name short, and the buttons never shrink. A
  // received row also wraps: below a 12rem name block beside both buttons,
  // as on a phone, Accept and Decline go to a line of their own.
  it("gives a received invite's name the row and keeps its buttons whole", () => {
    state.received = [invite({ name: 'Test Seller' })]
    show()
    const block = screen.getByText('Test Seller').closest('.flex.items-center')
    expect(block).toHaveClass('min-w-0', 'flex-1', 'basis-48')
    expect(block?.parentElement).toHaveClass('flex-wrap')
    expect(screen.getByText('Test Seller').parentElement).toHaveClass('min-w-0')
    const actions = screen.getByRole('button', {
      name: /^Accept$/,
    }).parentElement
    expect(actions).toHaveClass('shrink-0')
    expect(actions).toContainElement(
      screen.getByRole('button', { name: /^Decline$/ })
    )
  })

  it("lets a sent invite's name and address shrink and keeps Cancel whole", () => {
    state.sent = [
      {
        identity: 'me',
        id: 'xmpp:dave@example.org',
        direction: 'to',
        name: 'Dave',
        updated: 0,
        address: 'dave@example.org',
      },
    ]
    show()
    const name = screen.getByText('Dave')
    expect(name.closest('.flex.items-center')).toHaveClass('min-w-0', 'flex-1')
    expect(name.parentElement).toHaveClass('min-w-0')
    expect(screen.getByText('Pending · dave@example.org')).toHaveClass(
      'truncate'
    )
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toHaveClass(
      'shrink-0'
    )
  })

  it('counts the received invitations through the number formatter', () => {
    state.received = [invite({}), invite({ id: 'p2', name: 'Grace' })]
    show()
    expect(screen.getByText('Received (#2)')).toBeInTheDocument()
  })

  it('gives the search box a name', () => {
    state.received = [invite({})]
    show()
    // The header renders its actions once per layout, so there may be two.
    for (const box of screen.getAllByRole('textbox'))
      expect(box).toHaveAccessibleName('Search')
  })

  it('says when some of Accept all failed', async () => {
    state.received = [invite({}), invite({ id: 'p2', name: 'Grace' })]
    state.accept = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('refused'))
    show()
    fireEvent.click(screen.getByRole('button', { name: /Accept all/ }))
    await waitFor(() =>
      expect(state.toast.error).toHaveBeenCalledWith(
        'Some invitations could not be accepted'
      )
    )
    expect(state.toast.success).not.toHaveBeenCalled()
  })

  it('says when all of Accept all went through', async () => {
    state.received = [invite({}), invite({ id: 'p2', name: 'Grace' })]
    show()
    fireEvent.click(screen.getByRole('button', { name: /Accept all/ }))
    await waitFor(() =>
      expect(state.toast.success).toHaveBeenCalledWith(
        'All invitations accepted'
      )
    )
    expect(state.accept).toHaveBeenCalledTimes(2)
  })
})
