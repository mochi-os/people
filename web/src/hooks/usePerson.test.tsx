// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersonInformation } from '@/api/types/person'
import { useSetPrivacyMutation } from './usePerson'

const api = vi.hoisted(() => ({ setPrivacy: vi.fn() }))

vi.mock('@/api/person', () => ({ personApi: api }))

// The public switch flips on the click and goes back if the server refuses.
// The request waits until the test answers it.
let accept: () => void
let refuse: (error: unknown) => void
beforeEach(() => {
  api.setPrivacy.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        accept = () => resolve({})
        refuse = reject
      })
  )
})

const key = ['person', 'information', 'p1']

function mount() {
  const client = new QueryClient()
  client.setQueryData(key, { privacy: 'private' })
  const view = renderHook(() => useSetPrivacyMutation('p1'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  const privacy = () => client.getQueryData<PersonInformation>(key)?.privacy
  return { view, privacy }
}

describe('useSetPrivacyMutation', () => {
  it('flips at once and flips back when refused', async () => {
    const { view, privacy } = mount()

    act(() => view.result.current.mutate('public'))
    await waitFor(() => expect(privacy()).toBe('public'))

    act(() => refuse(new Error('refused')))
    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(privacy()).toBe('private')
  })

  it('keeps the new value when accepted', async () => {
    const { view, privacy } = mount()

    act(() => view.result.current.mutate('public'))
    await waitFor(() => expect(privacy()).toBe('public'))

    act(() => accept())
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(privacy()).toBe('public')
  })
})
