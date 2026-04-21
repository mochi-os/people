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
  auth: {
    code: '/_/code',
    verify: '/_/verify',
    identity: '/_/identity',
    logout: '/_/logout',
  },
  person: {
    information: (person: string) => `${person}/-/information`,
    avatar: (person: string) => `${person}/-/avatar`,
    avatarSet: (person: string) => `${person}/-/avatar/set`,
    bannerSet: (person: string) => `${person}/-/banner/set`,
    faviconSet: (person: string) => `${person}/-/favicon/set`,
    style: (person: string) => `${person}/-/style`,
    styleSet: (person: string) => `${person}/-/style/set`,
    profileSet: (person: string) => `${person}/-/profile/set`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
