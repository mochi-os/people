// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { requestHelpers } from '@mochi/web'
import endpoints from '@/api/endpoints'
import type {
  AcceptInviteRequest,
  CreateFriendRequest,
  DeclineInviteRequest,
  GetFriendsListResponse,
  MutationSuccessResponse,
  SearchUsersResponse,
  SearchLocalUsersResponse,
} from '@/api/types/friends'

const suppressMutationErrorToast = {
  mochi: { showGlobalErrorToast: false },
} as const

// The request helper unwraps the {"data": ...} envelope; action_list answers
// exactly this shape.
const listFriends = (): Promise<GetFriendsListResponse> =>
  requestHelpers.get<GetFriendsListResponse>(endpoints.friends.list)

const searchUsers = async (query: string): Promise<SearchUsersResponse> => {
  const formData = new URLSearchParams()
  formData.append('search', query)

  const response = await requestHelpers.post<SearchUsersResponse>(
    endpoints.friends.search,
    formData.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      mochi: {
        // This is query-owned UI; failures are rendered inline via GeneralError.
        showGlobalErrorToast: false,
      },
    }
  )
  return response
}

const searchLocalUsers = async (
  query: string
): Promise<SearchLocalUsersResponse> => {
  const formData = new URLSearchParams()
  formData.append('search', query)

  const response = await requestHelpers.post<SearchLocalUsersResponse>(
    endpoints.users.search,
    formData.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      mochi: {
        // This is query-owned UI; failures are rendered inline via GeneralError.
        showGlobalErrorToast: false,
      },
    }
  )
  return response
}

const toMutationSuccess = async <T>(
  promise: Promise<T>
): Promise<MutationSuccessResponse> => {
  await promise
  return { success: true }
}

const createFriend = (payload: CreateFriendRequest) =>
  toMutationSuccess(
    requestHelpers.post(
      endpoints.friends.create,
      {},
      {
        params: {
          id: payload.id,
          name: payload.name,
        },
        ...suppressMutationErrorToast,
      }
    )
  )

const acceptFriendInvite = (payload: AcceptInviteRequest) => {
  // Backend expects form-data (application/x-www-form-urlencoded)
  const formData = new URLSearchParams()
  formData.append('id', payload.id)

  return toMutationSuccess(
    requestHelpers.post(endpoints.friends.accept, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...suppressMutationErrorToast,
    })
  )
}

const declineFriendInvite = (payload: DeclineInviteRequest) => {
  // Backend expects form-data (application/x-www-form-urlencoded)
  const formData = new URLSearchParams()
  formData.append('id', payload.id)

  return toMutationSuccess(
    requestHelpers.post(endpoints.friends.ignore, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...suppressMutationErrorToast,
    })
  )
}

const removeFriend = (friendId: string) =>
  toMutationSuccess(
    requestHelpers.post(
      endpoints.friends.delete,
      {},
      {
        params: {
          id: friendId,
        },
        ...suppressMutationErrorToast,
      }
    )
  )

export type InvitePolicy = 'silent' | 'notify' | 'reject' | 'accept'

export interface PreferencesResponse {
  policy: InvitePolicy
}

const getPreferences = async (): Promise<PreferencesResponse> => {
  return requestHelpers.get<PreferencesResponse>(endpoints.preferences.get)
}

const setPreferences = async (payload: {
  policy: InvitePolicy
}): Promise<MutationSuccessResponse> => {
  const body = new URLSearchParams({ policy: payload.policy })
  await requestHelpers.post(endpoints.preferences.set, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    ...suppressMutationErrorToast,
  })
  return { success: true }
}

export const friendsApi = {
  list: listFriends,
  searchUsers,
  searchLocalUsers,
  create: createFriend,
  acceptInvite: acceptFriendInvite,
  declineInvite: declineFriendInvite,
  remove: removeFriend,
  getPreferences,
  setPreferences,
}

export type {
  CreateFriendRequest,
  GetFriendsListResponse,
  MutationSuccessResponse,
  SearchUsersResponse,
  SearchLocalUsersResponse,
}
