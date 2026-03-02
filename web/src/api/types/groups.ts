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

