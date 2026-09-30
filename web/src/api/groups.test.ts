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

const { groupsApi } = await import('./groups')

// The form body a request carried, and the options it went with.
const sent = () => new URLSearchParams(post.mock.calls[0][1] as string)
const options = () => post.mock.calls[0][2]

describe('Groups requests', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({})
  })

  it('creates a group without an empty id or description', async () => {
    await groupsApi.create({ name: 'Family', description: '' })
    expect(post.mock.calls[0][0]).toBe('/people/-/groups/create')
    expect(sent().get('name')).toBe('Family')
    expect(sent().has('id')).toBe(false)
    expect(sent().has('description')).toBe(false)
  })

  it('sends an empty description on update, since clearing it is an edit', async () => {
    await groupsApi.update({ id: 'g1', name: '', description: '' })
    expect(sent().get('id')).toBe('g1')
    expect(sent().has('name')).toBe(false)
    expect(sent().get('description')).toBe('')
  })

  it('posts a form and leaves the failure to the page', async () => {
    await groupsApi.addMember({ group: 'g1', member: 'p1', type: 'user' })
    expect(sent().get('type')).toBe('user')
    expect(options()).toMatchObject({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      mochi: { showGlobalErrorToast: false },
    })
  })
})
