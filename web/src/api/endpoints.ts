// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { getAppPath } from '@mochi/web'

// The class-level actions are addressed absolutely, from the app rather than
// from the request layer's baseURL.
//
// The same bundle is served on two kinds of URL: the app itself (/people/) and
// a person's profile (/people/<entity>). On the second the server injects a
// mochi:entity meta tag, so the request layer's baseURL becomes
// /people/<entity>/-/ — and a relative "-/friends" then addresses
// /people/<entity>/-/-/friends, which matches no action and falls through to
// the SPA catch-all. That returns index.html with status 200, so the failure
// arrives as a JSON parse error rather than a 404.
//
// A URL starting with "/" bypasses the baseURL (see api-client.ts), and
// getAppPath() reads mochi:app, which is "people" either way.
//
// Under domain routing getAppPath() is empty (the app name is not in the URL)
// and the domain's route path is not exported, so there is nothing to build an
// absolute URL from. Fall back to the relative form there, leaving that case as
// it is rather than replacing one wrong URL with another.
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
