// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { getAppPath } from '@mochi/web'

// Class-level actions are addressed absolutely: on a profile URL
// (/people/<entity>) the request layer's baseURL becomes /people/<entity>/-/,
// and a relative "-/contacts" falls through to the SPA catch-all. Under domain
// routing getAppPath() is empty and the baseURL already ends in "-/", so the
// action is named relative to it.
const app = getAppPath()
const action = (name: string) => (app ? `${app}/-/${name}` : name)

// Entity-scoped actions name their own entity, so they are absolute and do not
// depend on which entity the page happens to have been loaded under. On a
// direct entity URL (/<entity>) the app path is empty and the entity's own
// path addresses them.
const person = (id: string, name: string) => `${app}/${id}/-/${name}`

type Asset = 'avatar' | 'banner' | 'favicon' | 'style'

const endpoints = {
  contacts: {
    list: action('contacts'),
    get: action('contacts/get'),
    create: action('contacts/create'),
    update: action('contacts/update'),
    delete: action('contacts/delete'),
    search: action('contacts/search'),
  },
  books: {
    list: action('books'),
    create: action('books/create'),
    rename: action('books/rename'),
    delete: action('books/delete'),
  },
  friends: {
    invite: action('friends/invite'),
    accept: action('friends/accept'),
    ignore: action('friends/ignore'),
    remove: action('friends/remove'),
  },
  preferences: {
    get: action('preferences/get'),
    set: action('preferences/set'),
  },
  users: {
    search: action('users/search'),
  },
  tokens: {
    create: action('token/create'),
    list: action('token/list'),
    delete: action('token/delete'),
  },
  groups: {
    list: action('groups/list'),
    get: action('groups/get'),
    create: action('groups/create'),
    update: action('groups/update'),
    delete: action('groups/delete'),
    memberAdd: action('groups/members/add'),
    memberRemove: action('groups/members/remove'),
  },
  person: {
    information: (id: string) => person(id, 'information'),
    // A person's image or style, as a page embeds it. The version is the
    // stamp the information carries, so a new upload is a new URL rather than
    // the one the browser has cached.
    asset: (id: string, kind: Asset, version?: string) =>
      person(id, kind) + (version ? `?v=${version}` : ''),
    avatarSet: (id: string) => person(id, 'avatar/set'),
    bannerSet: (id: string) => person(id, 'banner/set'),
    faviconSet: (id: string) => person(id, 'favicon/set'),
    styleSet: (id: string) => person(id, 'style/set'),
    profileSet: (id: string) => person(id, 'profile/set'),
    nameSet: (id: string) => person(id, 'name/set'),
    privacySet: (id: string) => person(id, 'privacy/set'),
  },
} as const

export default endpoints
