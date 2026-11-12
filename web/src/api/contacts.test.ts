// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()

vi.mock('@mochi/web', () => ({
  getAppPath: () => '/people',
  requestHelpers: { post, get: vi.fn() },
}))

const { contactsApi } = await import('./contacts')

// The form body the invite request carried.
const sent = () => new URLSearchParams(post.mock.calls[0][1] as string)

describe('Invite request', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({})
  })

  it('sends no contact when none is given', async () => {
    await contactsApi.invite({ person: 'p1', name: 'Ann', contact: undefined })
    expect(sent().has('contact')).toBe(false)
    expect(sent().get('person')).toBe('p1')
    expect(sent().get('name')).toBe('Ann')
  })

  it('sends the contact a card is linked through', async () => {
    await contactsApi.invite({ person: 'p1', name: 'Ann', contact: 'c1' })
    expect(sent().get('contact')).toBe('c1')
  })
})

describe('Contact list request', () => {
  it('leaves the friends photos to their own request', async () => {
    const { requestHelpers } = await import('@mochi/web')
    vi.mocked(requestHelpers.get).mockResolvedValue({ contacts: [] })
    await contactsApi.list()
    expect(requestHelpers.get).toHaveBeenCalledWith(expect.any(String), {
      params: { photos: 0 },
    })
  })
})

describe('Search requests', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({})
  })

  it("asks the directory's search to leave other networks to their own request", async () => {
    await contactsApi.search('ada')
    expect(post.mock.calls[0][0]).toMatch(/contacts\/search$/)
    expect(sent().get('search')).toBe('ada')
    expect(sent().get('networks')).toBe('separate')
  })

  it('asks for other networks separately', async () => {
    await contactsApi.networks('ada')
    expect(post.mock.calls[0][0]).toMatch(/contacts\/search\/networks$/)
    expect(sent().get('search')).toBe('ada')
  })
})
