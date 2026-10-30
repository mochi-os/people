// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactsQuery, useUpdateContactMutation } from './useContacts'

const api = vi.hoisted(() => ({
  update: vi.fn(),
  list: vi.fn(),
  photos: vi.fn(),
}))

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

// A friend's photo is a fetch from their server, five seconds when it is
// offline: the list asks for none of them, and every listing is followed by
// one request for them.
describe('useContactsQuery photos', () => {
  const listed = { contacts: [], received: [], sent: [] }

  beforeEach(() => {
    api.list = vi.fn().mockResolvedValue(listed)
    api.photos = vi.fn()
  })

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

  it('asks for the photos once the list is in, and lists again only when one changed', async () => {
    api.photos
      .mockResolvedValueOnce({ changed: 1 })
      .mockResolvedValue({ changed: 0 })
    const { wrapper } = setup()
    renderHook(() => useContactsQuery(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.photos).toHaveBeenCalledTimes(2))
    await settle()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('leaves the list alone when no photo changed', async () => {
    api.photos.mockResolvedValue({ changed: 0 })
    const { wrapper } = setup()
    renderHook(() => useContactsQuery(), { wrapper })
    await waitFor(() => expect(api.photos).toHaveBeenCalledTimes(1))
    await settle()
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  // Accepting a friend resets their photo's stamp so it is fetched at once;
  // the listing after it is what asks.
  it('asks again after a write lists the contacts again', async () => {
    api.photos.mockResolvedValue({ changed: 0 })
    const { queryClient, wrapper } = setup()
    renderHook(() => useContactsQuery(), { wrapper })
    await waitFor(() => expect(api.photos).toHaveBeenCalledTimes(1))
    // What every contact write does (useInvalidateContacts).
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
    })
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.photos).toHaveBeenCalledTimes(2))
  })

  it('asks once per listing however many screens list contacts', async () => {
    api.photos.mockResolvedValue({ changed: 0 })
    const { wrapper } = setup()
    renderHook(
      () => {
        useContactsQuery()
        useContactsQuery('b1')
      },
      { wrapper }
    )
    await waitFor(() => expect(api.photos).toHaveBeenCalledTimes(1))
    await settle()
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.photos).toHaveBeenCalledTimes(1)
  })
})
