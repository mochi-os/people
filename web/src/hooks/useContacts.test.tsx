// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateContactMutation } from './useContacts'

const api = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('@/api/contacts', () => ({ contactsApi: api }))

const card = (name: string) => [{ name: 'FN', params: {}, value: name }]

const stored = (id: string, name: string, etag: string) => ({
  id,
  book: 'b1',
  person: '',
  friend: false,
  name,
  directory: '',
  created: 0,
  updated: 0,
  card: card(name),
  etag,
})

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // Both contacts as an earlier visit to each editor left them cached.
  queryClient.setQueryData(['contacts', 's1'], {
    contact: stored('s1', 'Survivor', 'e1'),
  })
  queryClient.setQueryData(['contacts', 'a1'], {
    contact: stored('a1', 'Absorbed', 'e2'),
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useUpdateContactMutation', () => {
  beforeEach(() => {
    api.update.mockReset()
  })

  it('keeps the merged card for the survivor, so its editor does not open on the card from before', async () => {
    const merged = stored('s1', 'Survivor merged', 'e3')
    api.update.mockResolvedValue({ contact: merged })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useUpdateContactMutation(), {
      wrapper,
    })
    await act(async () => {
      await result.current.mutateAsync({
        contact: 's1',
        etag: 'e1',
        source: { id: 'a1', etag: 'e2' },
        properties: card('Survivor merged'),
      })
    })
    expect(queryClient.getQueryData(['contacts', 's1'])).toEqual({
      contact: merged,
    })
    expect(queryClient.getQueryData(['contacts', 'a1'])).toBeUndefined()
  })

  it('keeps the saved card for a contact edited on its own', async () => {
    const saved = stored('s1', 'Survivor renamed', 'e4')
    api.update.mockResolvedValue({ contact: saved })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useUpdateContactMutation(), {
      wrapper,
    })
    await act(async () => {
      await result.current.mutateAsync({
        contact: 's1',
        etag: 'e1',
        properties: card('Survivor renamed'),
      })
    })
    expect(queryClient.getQueryData(['contacts', 's1'])).toEqual({
      contact: saved,
    })
  })
})
