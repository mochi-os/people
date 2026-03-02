export interface PaginationMeta {
  total?: number
  page?: number
  limit?: number
}

export interface Friend {
  class: string
  id: string
  identity: string
  name: string
  [key: string]: unknown
}

export type FriendInvite = Friend

export interface FriendsListEnvelope extends PaginationMeta {
  friends?: unknown
  received?: unknown
  sent?: unknown
  data?: unknown
  items?: unknown
  results?: unknown
}

// Friends endpoints have emitted different wrappers (top-level, data object, nested collections), so we normalise at the service layer.
export type GetFriendsListRaw = Friend[] | FriendsListEnvelope

export interface GetFriendsListResponse {
  friends: Friend[]
  received: FriendInvite[]
  sent: FriendInvite[]
  total?: number
  page?: number
  limit?: number
}

export interface CreateFriendRequest {
  id: string
  name: string
}

export interface AcceptInviteRequest {
  id: string
}

export interface DeclineInviteRequest {
  id: string
}

export interface MutationSuccessResponse {
  success: boolean
  message?: string
}

export type RelationshipStatus = 'friend' | 'invited' | 'pending' | 'self' | 'none'

export interface User {
  class: string
  created: number
  data: string
  fingerprint: string
  fingerprint_hyphens: string
  id: string
  location: string
  name: string
  updated: number
  relationshipStatus?: RelationshipStatus
  [key: string]: unknown
}

export interface SearchUsersResponse {
  results: User[]
  [key: string]: unknown
}

export interface LocalUser {
  id: string
  name: string
}

export interface SearchLocalUsersResponse {
  results: LocalUser[]
}
