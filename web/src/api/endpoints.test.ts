// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { afterEach, describe, expect, it, vi } from 'vitest'

const routing = vi.hoisted(() => ({ app: '/people', domain: false }))

vi.mock('@mochi/web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mochi/web')>()),
  getAppPath: () => routing.app,
  isDomainEntityRouting: () => routing.domain,
}))

// The builder reads the app path once, as the page loads. An empty app path
// is either domain routing or a direct entity URL (/<entity>).
type Endpoints = (typeof import('./endpoints'))['default']

async function load(app: string, domain = false): Promise<Endpoints> {
  routing.app = app
  routing.domain = domain
  vi.resetModules()
  return (await import('./endpoints')).default
}

afterEach(() => {
  routing.app = '/people'
  routing.domain = false
})

describe('endpoints', () => {
  it('addresses class actions under the app path', async () => {
    const endpoints = await load('/people')
    expect(endpoints.contacts.list).toBe('/people/-/contacts')
    expect(endpoints.groups.memberAdd).toBe('/people/-/groups/members/add')
  })

  it('names class actions relative to a domain-routed base that already ends in -/', async () => {
    const endpoints = await load('', true)
    expect(endpoints.contacts.list).toBe('contacts')
    expect(endpoints.groups.memberAdd).toBe('groups/members/add')
  })

  it("addresses a person's actions absolutely under the app path", async () => {
    const endpoints = await load('/people')
    expect(endpoints.person.information('p1')).toBe('/people/p1/-/information')
    expect(endpoints.person.avatarSet('p1')).toBe('/people/p1/-/avatar/set')
  })

  it('reaches class actions from a direct entity URL through the app path', async () => {
    // At /<entity> no relative name reaches a class action, and /<entity>/-/
    // answers the SPA document instead.
    const endpoints = await load('')
    expect(endpoints.contacts.list).toBe('/people/-/contacts')
    expect(endpoints.person.information('p1')).toBe('/people/p1/-/information')
  })

  it("addresses a person's actions by the entity's own path under domain routing", async () => {
    const endpoints = await load('', true)
    expect(endpoints.person.information('p1')).toBe('/p1/-/information')
  })

  it("builds a person's images with the version they carry", async () => {
    const endpoints = await load('/people')
    expect(endpoints.person.asset('p1', 'avatar', '17')).toBe(
      '/people/p1/-/avatar?v=17'
    )
    expect(endpoints.person.asset('p1', 'style')).toBe('/people/p1/-/style')
    expect((await load('', true)).person.asset('p1', 'banner', '4')).toBe(
      '/p1/-/banner?v=4'
    )
  })
})

const refused = ['../delete', 'a/b', '.', '..', '']

describe("a person's id", () => {
  // One builder of each shape: a person's action, and a person's image with
  // and without its version.
  const builders: Array<
    [string, (table: Endpoints, id: string) => string, string]
  > = [
    [
      'information',
      (table, id) => table.person.information(id),
      '/people/p1/-/information',
    ],
    [
      'avatarSet',
      (table, id) => table.person.avatarSet(id),
      '/people/p1/-/avatar/set',
    ],
    [
      'asset',
      (table, id) => table.person.asset(id, 'style'),
      '/people/p1/-/style',
    ],
    [
      'asset with a version',
      (table, id) => table.person.asset(id, 'avatar', '17'),
      '/people/p1/-/avatar?v=17',
    ],
  ]

  describe.each(builders)('%s', (_, build, before) => {
    it('builds the same path for a normal id', async () => {
      expect(build(await load('/people'), 'p1')).toBe(before)
    })

    it.each(refused)('refuses %j', async (value) => {
      const endpoints = await load('/people')
      expect(() => build(endpoints, value)).toThrow(/path: refused/)
    })

    it('keeps a query inside its segment', async () => {
      expect(build(await load('/people'), 'x?y=1')).toBe(
        before.replace('p1', 'x%3Fy%3D1')
      )
    })

    it('refuses under domain routing too', async () => {
      const endpoints = await load('', true)
      expect(() => build(endpoints, '../delete')).toThrow(/path: refused/)
    })
  })

  it("keeps a version's query inside its value", async () => {
    const endpoints = await load('/people')
    expect(endpoints.person.asset('p1', 'avatar', 'x&y=1')).toBe(
      '/people/p1/-/avatar?v=x%26y%3D1'
    )
  })
})

describe('personAsset', () => {
  it('builds the same address as the table for a normal id', async () => {
    await load('/people')
    const { personAsset } = await import('./endpoints')
    expect(personAsset('p1', 'avatar', '17')).toBe('/people/p1/-/avatar?v=17')
  })

  // Drawn during a render, so a refused id leaves the image out rather than
  // throwing.
  it.each(refused)('has no address for %j', async (value) => {
    await load('/people')
    const { personAsset } = await import('./endpoints')
    expect(personAsset(value, 'style')).toBeUndefined()
  })
})
