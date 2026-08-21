// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { getAppPath } from '@mochi/web'

// Class-level actions are addressed absolutely: on a profile URL
// (/people/<entity>) the request layer's baseURL becomes /people/<entity>/-/,
// and a relative "-/friends" falls through to the SPA catch-all. Under domain
// routing getAppPath() is empty, so fall back to relative.
const app = getAppPath()
const prefix = app ? `${app}/-` : '-'
const personPrefix = (person: string) => (app ? `${app}/${person}/-` : `${person}/-`)

const endpoints = {
  friends: {
    list: `${prefix}/friends`,
    search: `${prefix}/friends/search`,
    create: `${prefix}/friends/create`,
    accept: `${prefix}/friends/accept`,
    ignore: `${prefix}/friends/ignore`,
    delete: `${prefix}/friends/delete`,
  },
  preferences: {
    get: `${prefix}/preferences/get`,
    set: `${prefix}/preferences/set`,
  },
  users: {
    search: `${prefix}/users/search`,
  },
  groups: {
    list: `${prefix}/groups/list`,
    get: `${prefix}/groups/get`,
    create: `${prefix}/groups/create`,
    update: `${prefix}/groups/update`,
    delete: `${prefix}/groups/delete`,
    memberAdd: `${prefix}/groups/members/add`,
    memberRemove: `${prefix}/groups/members/remove`,
  },
  // Entity-scoped actions name their own entity, so they are absolute too and
  // do not depend on which entity the page happens to have been loaded under.
  person: {
    information: (person: string) => `${personPrefix(person)}/information`,
    avatar: (person: string) => `${personPrefix(person)}/avatar`,
    avatarSet: (person: string) => `${personPrefix(person)}/avatar/set`,
    bannerSet: (person: string) => `${personPrefix(person)}/banner/set`,
    faviconSet: (person: string) => `${personPrefix(person)}/favicon/set`,
    styleSet: (person: string) => `${personPrefix(person)}/style/set`,
    profileSet: (person: string) => `${personPrefix(person)}/profile/set`,
    nameSet: (person: string) => `${personPrefix(person)}/name/set`,
    privacySet: (person: string) => `${personPrefix(person)}/privacy/set`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
