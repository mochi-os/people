// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemberDialog } from './member-dialog'

const state = vi.hoisted(() => ({
  results: [] as { id: string; name: string }[],
  searched: [] as string[],
}))

beforeEach(() => {
  state.results = []
  state.searched = []
})

vi.mock('@/hooks/useContacts', () => ({
  useSearchLocalUsersQuery: (search: string) => {
    state.searched.push(search)
    return {
      data: search ? { results: state.results } : undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }
  },
}))
vi.mock('@/hooks/useGroups', () => ({
  useGroupsQuery: () => ({
    data: [
      { id: 'g3', name: 'work', description: '', created: 0 },
      { id: 'g1', name: 'Family', description: '', created: 0 },
      { id: 'g2', name: 'Band', description: '', created: 0 },
      { id: 'g4', name: 'already in', description: '', created: 0 },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAddGroupMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <MemberDialog
          open
          onOpenChange={vi.fn()}
          groupId='g1'
          members={[
            {
              member: 'g4',
              name: 'already in',
              type: 'group',
              fingerprint: '',
            },
          ]}
        />
      </I18nProvider>
    </QueryClientProvider>
  )
}

function groupTab() {
  const tab = screen.getByRole('tab', { name: 'Group' })
  fireEvent.mouseDown(tab)
  fireEvent.click(tab)
  return screen.getByRole('tabpanel')
}

describe('MemberDialog', () => {
  it('offers only the groups not already in this one, sorted by name', () => {
    show()
    const panel = groupTab()
    const names = within(panel)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual(['Band', 'work'])
  })

  it('lists found people sorted by name', async () => {
    state.results = [
      { id: 'p2', name: 'zoe' },
      { id: 'p1', name: 'Ada' },
    ]
    show()
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'a' },
    })
    await screen.findByText('Ada', {}, { timeout: 2000 })
    const names = within(screen.getByRole('tabpanel'))
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(names).toEqual(['Ada', 'zoe'])
  })

  it('makes each found person a button that can be chosen from the keyboard', async () => {
    state.results = [{ id: 'p1', name: 'Ada' }]
    show()
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'a' },
    })
    const choice = await screen.findByRole(
      'button',
      { name: /Ada/ },
      { timeout: 2000 }
    )
    expect(choice.tagName).toBe('BUTTON')
    expect(choice).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(choice)
    expect(choice).toHaveAttribute('aria-pressed', 'true')
  })

  it('says nothing is found only once the search has run', () => {
    show()
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'ad' },
    })
    expect(screen.queryByText('No people found')).toBeNull()
    expect(screen.getByText('Searching...')).toBeInTheDocument()
  })

  it('carries no placeholder or help text in the search', () => {
    show()
    expect(screen.getByLabelText('Search users')).not.toHaveAttribute(
      'placeholder'
    )
    expect(screen.queryByText('Type to search users')).toBeNull()
  })
})
