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
  members: ChatMember[]
  name: string
  [key: string]: unknown
}

