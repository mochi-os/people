// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Received } from '@/api/types/contacts'
import { Invitations } from './index'

const state = vi.hoisted(() => ({
  received: [] as Received[],
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
    data: { contacts: [], received: state.received, sent: [] },
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
