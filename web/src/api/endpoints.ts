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
} as const

export type Endpoints = typeof endpoints

export default endpoints
