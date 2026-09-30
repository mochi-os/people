// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import type { NavItem, NavMenuItem, SidebarData } from '@mochi/web'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PeopleLayout } from './people-layout'

const book = (id: string, name: string) => ({
  id,
  fingerprint: id,
  name,
  count: 0,
  default: false,
  version: 0,
  created: 0,
  updated: 0,
})

const state = vi.hoisted(() => ({
  viewing: '',
  navigate: vi.fn(),
  remove: vi.fn(),
  avatar: '',
  received: [] as unknown[],
}))

beforeEach(() => {
  state.navigate = vi.fn()
  state.remove = vi.fn().mockResolvedValue({})
  state.avatar = ''
  state.received = []
})

// The sidebar reduced to what a test reads: the book menus, so it can pick
// Delete from one, the profile entry's icon and the badges.
vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  useAuthStore: (select: (store: { identity: string }) => unknown) =>
    select({ identity: 'me' }),
  // A formatter that shows it was used, whatever the test's locale.
  useFormat: () => ({ formatNumber: (value: number) => `#${value}` }),
  AuthenticatedLayout: ({ sidebarData }: { sidebarData: SidebarData }) => (
    <div>
      {sidebarData.navGroups.flatMap((group) =>
        (group.items as NavItem[]).flatMap((item) => {
          const Icon = item.icon as React.FC | undefined
          const badge = (item as { badge?: string }).badge
          return [
            item.title === 'Profile' && Icon ? (
              <span key={`${item.title}-icon`} data-testid='profile-icon'>
                <Icon />
              </span>
            ) : null,
            badge ? (
              <span key={`${item.title}-badge`} data-testid='badge'>
                {badge}
              </span>
            ) : null,
            ...((item as { menu?: NavMenuItem[] }).menu ?? []).map((entry) => (
              <button
                key={`${item.title}-${entry.title}`}
                onClick={entry.onClick}
              >{`${entry.title} ${item.title}`}</button>
            )),
          ]
        })
      )}
    </div>
  ),
}))
vi.mock('@/hooks/usePerson', () => ({
  usePersonInformationQuery: () => ({ data: { avatar: state.avatar } }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => state.navigate,
  useMatchRoute:
    () =>
    ({ params }: { params: { id: string } }) =>
      params.id === state.viewing ? params : false,
}))
vi.mock('@/hooks/useContacts', () => ({
  useBooksQuery: () => ({
    data: { books: [book('b1', 'Family'), book('b2', 'Work')] },
  }),
  useContactsQuery: () => ({
    data: { contacts: [], received: state.received, sent: [] },
  }),
  useCreateBookMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBookMutation: () => ({
    mutateAsync: state.remove,
    isPending: false,
  }),
  useRenameBookMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useGroups', () => ({
  useGroupsQuery: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/features/contacts/connect-dialog', () => ({
  ConnectDialog: () => null,
}))
vi.mock('@/features/groups/group-dialog', () => ({ GroupDialog: () => null }))

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <PeopleLayout />
      </I18nProvider>
    </QueryClientProvider>
  )
}

function remove(name: string) {
  show()
  fireEvent.click(screen.getByRole('button', { name: `Delete ${name}` }))
  fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
}

describe('PeopleLayout', () => {
  it('leaves the page of an address book once it is deleted', async () => {
    state.viewing = 'b2'
    remove('Work')
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('b2'))
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith({ to: '/' })
    )
  })

  it('stays where it is when another address book is deleted', async () => {
    state.viewing = 'b1'
    remove('Work')
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('b2'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it("versions the user's own avatar by its stamp, so an upload shows at once", () => {
    state.avatar = '1790000000'
    show()
    const image = screen.getByTestId('profile-icon').querySelector('img')
    expect(image?.getAttribute('src')).toContain('/me/-/avatar?v=1790000000')
  })

  it('counts pending invitations through the number formatter', () => {
    state.received = [{ id: 'p1' }, { id: 'p2' }]
    show()
    expect(screen.getByTestId('badge')).toHaveTextContent('#2')
  })
})
