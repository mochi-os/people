// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export interface Group {
  id: string
  name: string
  description: string
  created: number
}

export interface GroupMember {
  member: string
  name: string
  type: 'user' | 'group'
}

export interface GetGroupsResponse {
  groups: Group[]
}

export interface GetGroupResponse {
  group: Group
  members: GroupMember[]
}

export interface CreateGroupRequest {
  id?: string
  name: string
  description?: string
}

export interface UpdateGroupRequest {
  id: string
  name?: string
  description?: string
}

export interface AddGroupMemberRequest {
  group: string
  member: string
  type: 'user' | 'group'
}

export interface RemoveGroupMemberRequest {
  group: string
  member: string
}

