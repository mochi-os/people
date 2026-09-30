// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { t } from '@lingui/core/macro'
import { requestHelpers } from '@mochi/web'
import endpoints from '@/api/endpoints'
import { body, form, quiet } from '@/api/request'
import type { MutationSuccessResponse } from '@/api/types/contacts'
import type {
  AddGroupMemberRequest,
  CreateGroupRequest,
  GetGroupResponse,
  GetGroupsResponse,
  Group,
  GroupMember,
  RemoveGroupMemberRequest,
  UpdateGroupRequest,
} from '@/api/types/groups'

const listGroups = async (): Promise<Group[]> => {
  const response = await requestHelpers.get<GetGroupsResponse>(
    endpoints.groups.list
  )
  return response?.groups ?? []
}

const getGroup = async (
  id: string
): Promise<{ group: Group; members: GroupMember[] }> => {
  const response = await requestHelpers.post<GetGroupResponse>(
    endpoints.groups.get,
    body({ id }),
    { ...form, ...quiet }
  )

  if (!response?.group) {
    throw new Error(t`Group not found`)
  }

  return {
    group: response.group,
    members: response.members ?? [],
  }
}

const post = async (
  url: string,
  fields: Record<string, string | undefined>
): Promise<MutationSuccessResponse> => {
  await requestHelpers.post(url, body(fields), { ...form, ...quiet })
  return { success: true }
}

// An empty id or description is not sent: the server makes the id and
// leaves the description blank.
const createGroup = (payload: CreateGroupRequest) =>
  post(endpoints.groups.create, {
    id: payload.id || undefined,
    name: payload.name,
    description: payload.description || undefined,
  })

// An empty name is not sent, since a group needs one; an empty description is,
// since clearing it is a real edit.
const updateGroup = (payload: UpdateGroupRequest) =>
  post(endpoints.groups.update, {
    id: payload.id,
    name: payload.name || undefined,
    description: payload.description,
  })

const deleteGroup = (id: string) => post(endpoints.groups.delete, { id })

const addMember = (payload: AddGroupMemberRequest) =>
  post(endpoints.groups.memberAdd, {
    group: payload.group,
    member: payload.member,
    type: payload.type,
  })

const removeMember = (payload: RemoveGroupMemberRequest) =>
  post(endpoints.groups.memberRemove, {
    group: payload.group,
    member: payload.member,
  })

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
  Group,
  GroupMember,
  MutationSuccessResponse,
  RemoveGroupMemberRequest,
  UpdateGroupRequest,
}
