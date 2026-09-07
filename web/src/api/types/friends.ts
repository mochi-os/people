// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// A row of the friends table, as action_list returns it.
export interface Friend {
  class: string
  id: string
  identity: string
  name: string
  created: number
  refreshed: number
}

// A row of the invites table; it has no class or created column.
export interface FriendInvite {
  identity: string
  id: string
  direction: 'from' | 'to'
  name: string
  updated: number
}

export interface GetFriendsListResponse {
  friends: Friend[]
  received: FriendInvite[]
  sent: FriendInvite[]
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

type RelationshipStatus = 'friend' | 'invited' | 'pending' | 'self' | 'none'

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
  relationship?: RelationshipStatus
  [key: string]: unknown
}

export interface SearchUsersResponse {
  results: User[]
  [key: string]: unknown
}

interface LocalUser {
  id: string
  name: string
}

export interface SearchLocalUsersResponse {
  results: LocalUser[]
}
