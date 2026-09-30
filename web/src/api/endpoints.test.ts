// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { afterEach, describe, expect, it, vi } from 'vitest'

const path = vi.hoisted(() => ({ app: '/people' }))

vi.mock('@mochi/web', () => ({ getAppPath: () => path.app }))

// The builder reads the app path once, as the page loads.
async function load(app: string) {
  path.app = app
  vi.resetModules()
  return (await import('./endpoints')).default
}

afterEach(() => {
  path.app = '/people'
})

describe('endpoints', () => {
  it('addresses class actions under the app path', async () => {
    const endpoints = await load('/people')
    expect(endpoints.contacts.list).toBe('/people/-/contacts')
    expect(endpoints.groups.memberAdd).toBe('/people/-/groups/members/add')
  })

  it('names class actions relative to a base that already ends in -/', async () => {
    const endpoints = await load('')
    expect(endpoints.contacts.list).toBe('contacts')
    expect(endpoints.groups.memberAdd).toBe('groups/members/add')
  })

  it("addresses a person's actions absolutely under the app path", async () => {
    const endpoints = await load('/people')
    expect(endpoints.person.information('p1')).toBe('/people/p1/-/information')
    expect(endpoints.person.avatarSet('p1')).toBe('/people/p1/-/avatar/set')
  })

  it("addresses a person's actions by the entity's own path with no app path", async () => {
    const endpoints = await load('')
    expect(endpoints.person.information('p1')).toBe('/p1/-/information')
  })

  it("builds a person's images with the version they carry", async () => {
    const endpoints = await load('/people')
    expect(endpoints.person.asset('p1', 'avatar', '17')).toBe(
      '/people/p1/-/avatar?v=17'
    )
    expect(endpoints.person.asset('p1', 'style')).toBe('/people/p1/-/style')
    expect((await load('')).person.asset('p1', 'banner', '4')).toBe(
      '/p1/-/banner?v=4'
    )
  })
})
