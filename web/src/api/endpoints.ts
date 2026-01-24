const endpoints = {
  friends: {
    list: '/people/-/friends',
    search: '/people/-/friends/search',
    create: '/people/-/friends/create',
    accept: '/people/-/friends/accept',
    ignore: '/people/-/friends/ignore',
    delete: '/people/-/friends/delete',
  },
  welcome: {
    get: '/people/-/welcome',
    seen: '/people/-/welcome/seen',
  },
  users: {
    search: '/people/-/users/search',
  },
  groups: {
    list: '/people/-/groups/list',
    get: '/people/-/groups/get',
    create: '/people/-/groups/create',
    update: '/people/-/groups/update',
    delete: '/people/-/groups/delete',
    memberAdd: '/people/-/groups/members/add',
    memberRemove: '/people/-/groups/members/remove',
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
