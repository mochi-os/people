export interface Chat {
  id: string
  identity: string
  key: string
  name: string
  updated: number
}

export interface ChatMember {
  id: string
  name: string
}

export interface CreateChatRequest {
  name: string
  participantIds: string[]
}

export interface CreateChatResponse {
  id: string
  fingerprint?: string
  members: ChatMember[]
  name: string
  [key: string]: unknown
}

export interface NewChatFriend {
  class: string
  id: string
  identity: string
  name: string
  chatId?: string
  chatFingerprint?: string
}

export interface GetNewChatResponse {
  friends: NewChatFriend[]
  name: string
}
