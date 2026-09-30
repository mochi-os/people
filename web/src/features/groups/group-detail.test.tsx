// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GroupDetail } from './group-detail'

const lost = 'x'.repeat(50)
const gone = '019fadb5860275b2a5ec907cafda0000'

vi.mock('@mochi/web', async (original) => ({
  ...(await original<typeof import('@mochi/web')>()),
  // A formatter that shows it was used, whatever the test's locale.
  useFormat: () => ({ formatNumber: (value: number) => `#${value}` }),
}))
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'g1' }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: { canGoBack: () => false, back: vi.fn() } }),
}))
vi.mock('@/hooks/useGroups', () => ({
  useGroupQuery: () => ({
    data: {
      group: { id: 'g1', name: 'Family', description: '', created: 0 },
      members: [
        { member: 'p1', name: 'Ada', type: 'user', fingerprint: 'abcdefghi' },
        { member: lost, name: '', type: 'user', fingerprint: 'qwertyuio' },
        { member: gone, name: '', type: 'group', fingerprint: '' },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRemoveGroupMemberMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteGroupMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('./member-dialog', () => ({ MemberDialog: () => null }))
vi.mock('./group-dialog', () => ({ GroupDialog: () => null }))

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider i18n={i18n}>
        <GroupDetail />
      </I18nProvider>
    </QueryClientProvider>
  )
}

describe('GroupDetail', () => {
  it('labels a member the server could not name, never by its raw id', () => {
    const { container } = show()
    expect(screen.getByText('Unknown person')).toBeInTheDocument()
    expect(screen.getByText('qwe-rty-uio')).toBeInTheDocument()
    expect(screen.getByText('Deleted group')).toBeInTheDocument()
    expect(container.textContent).not.toContain(lost)
    expect(container.textContent).not.toContain(gone)
  })

  it("does not show the group's raw id", () => {
    const { container } = show()
    expect(screen.queryByText('Group ID')).toBeNull()
    expect(container.textContent).not.toContain('g1')
  })

  it('counts the members through the number formatter', () => {
    show()
    expect(screen.getByText('#3')).toBeInTheDocument()
  })

  it('names its back link for the page it returns to', () => {
    show()
    expect(
      screen.getByRole('button', { name: 'Back to contacts' })
    ).toBeInTheDocument()
  })

  it('leads the remove confirmation with its icon', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', {
      name: /Remove member/,
    })
    expect(confirm.querySelector('svg.lucide-user-minus')).not.toBeNull()
  })

  it('leads the delete confirmation with its icon', () => {
    show()
    // The header draws its actions once per layout.
    fireEvent.keyDown(
      screen.getAllByRole('button', { name: 'Group actions' })[0],
      { key: 'Enter' }
    )
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /Delete/ })
    expect(
      confirm.querySelector('svg.lucide-trash2, svg.lucide-trash-2')
    ).not.toBeNull()
  })

  it('gives the Add member icon no margin of its own', () => {
    show()
    for (const add of screen.getAllByRole('button', { name: /Add member/ }))
      expect(add.querySelector('svg')?.getAttribute('class')).not.toMatch(
        /\bm[se]-2\b/
      )
  })
})
