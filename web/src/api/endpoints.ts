// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

const endpoints = {
  friends: {
    list: '-/friends',
    search: '-/friends/search',
    create: '-/friends/create',
    accept: '-/friends/accept',
    ignore: '-/friends/ignore',
    delete: '-/friends/delete',
  },
  welcome: {
    get: '-/welcome',
    seen: '-/welcome/seen',
  },
  preferences: {
    get: '-/preferences/get',
    set: '-/preferences/set',
  },
  users: {
    search: '-/users/search',
  },
  groups: {
    list: '-/groups/list',
    get: '-/groups/get',
    create: '-/groups/create',
    update: '-/groups/update',
    delete: '-/groups/delete',
    memberAdd: '-/groups/members/add',
    memberRemove: '-/groups/members/remove',
  },
  person: {
    information: (person: string) => `${person}/-/information`,
    avatar: (person: string) => `${person}/-/avatar`,
    avatarSet: (person: string) => `${person}/-/avatar/set`,
    bannerSet: (person: string) => `${person}/-/banner/set`,
    faviconSet: (person: string) => `${person}/-/favicon/set`,
    styleSet: (person: string) => `${person}/-/style/set`,
    profileSet: (person: string) => `${person}/-/profile/set`,
    nameSet: (person: string) => `${person}/-/name/set`,
    privacySet: (person: string) => `${person}/-/privacy/set`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
