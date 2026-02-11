import endpoints from '@/api/endpoints'
import type {
  AddGroupMemberRequest,
  CreateGroupRequest,
  GetGroupResponse,
  GetGroupsResponse,
  Group,
  GroupMember,
  MutationSuccessResponse,
  RemoveGroupMemberRequest,
  UpdateGroupRequest,
} from '@/api/types/groups'
import { requestHelpers } from '@mochi/common'

const listGroups = async (): Promise<Group[]> => {
  const response = await requestHelpers.get<GetGroupsResponse>(
    endpoints.groups.list
  )
  return response?.groups ?? []
}

const getGroup = async (id: string): Promise<{ group: Group; members: GroupMember[] }> => {
  const params = new URLSearchParams()
  params.append('id', id)

  const response = await requestHelpers.post<GetGroupResponse>(
    endpoints.groups.get,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )

  if (!response?.group) {
    throw new Error('Group not found')
  }

  return {
    group: response.group,
    members: response.members ?? [],
  }
}

const createGroup = async (payload: CreateGroupRequest): Promise<MutationSuccessResponse> => {
  const params = new URLSearchParams()
  if (payload.id) {
    params.append('id', payload.id)
  }
  params.append('name', payload.name)
  if (payload.description) {
    params.append('description', payload.description)
  }

  await requestHelpers.post(
    endpoints.groups.create,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return { success: true }
}

const updateGroup = async (payload: UpdateGroupRequest): Promise<MutationSuccessResponse> => {
  const params = new URLSearchParams()
  params.append('id', payload.id)
  if (payload.name) {
    params.append('name', payload.name)
  }
  if (payload.description !== undefined) {
    params.append('description', payload.description)
  }

  await requestHelpers.post(
    endpoints.groups.update,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return { success: true }
}

const deleteGroup = async (id: string): Promise<MutationSuccessResponse> => {
  const params = new URLSearchParams()
  params.append('id', id)

  await requestHelpers.post(
    endpoints.groups.delete,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return { success: true }
}

const addMember = async (payload: AddGroupMemberRequest): Promise<MutationSuccessResponse> => {
  const params = new URLSearchParams()
  params.append('group', payload.group)
  params.append('member', payload.member)
  params.append('type', payload.type)

  await requestHelpers.post(
    endpoints.groups.memberAdd,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return { success: true }
}

const removeMember = async (payload: RemoveGroupMemberRequest): Promise<MutationSuccessResponse> => {
  const params = new URLSearchParams()
  params.append('group', payload.group)
  params.append('member', payload.member)

  await requestHelpers.post(
    endpoints.groups.memberRemove,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return { success: true }
}

export const groupsApi = {
  list: listGroups,
  get: getGroup,
  create: createGroup,
  update: updateGroup,
  delete: deleteGroup,
  addMember,
  removeMember,
}

export type {
  AddGroupMemberRequest,
  CreateGroupRequest,
  GetGroupResponse,
  GetGroupsResponse,
  Group,
  GroupMember,
  RemoveGroupMemberRequest,
  UpdateGroupRequest,
}

