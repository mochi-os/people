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
}))

beforeEach(() => {
  state.navigate = vi.fn()
  state.remove = vi.fn().mockResolvedValue({})
})

// The sidebar reduced to the book menus it would draw, so a test can pick
// Delete from one.
vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  AuthenticatedLayout: ({ sidebarData }: { sidebarData: SidebarData }) => (
    <div>
      {sidebarData.navGroups.flatMap((group) =>
        (group.items as NavItem[]).flatMap((item) =>
          ((item as { menu?: NavMenuItem[] }).menu ?? []).map((entry) => (
            <button
              key={`${item.title}-${entry.title}`}
              onClick={entry.onClick}
            >{`${entry.title} ${item.title}`}</button>
          ))
        )
      )}
    </div>
  ),
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
  useContactsQuery: () => ({ data: { contacts: [], received: [], sent: [] } }),
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

function remove(name: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <PeopleLayout />
      </I18nProvider>
    </QueryClientProvider>
  )
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
})
