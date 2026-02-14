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
  chat: {
    list: '/chat/list',
    new: '/chat/new',
    create: '/chat/create',
    messages: (chatId: string) => `/chat/${chatId}/messages`,
    send: (chatId: string) => `/chat/${chatId}/send`,
    detail: (chatId: string) => `/chat/${chatId}`,
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
