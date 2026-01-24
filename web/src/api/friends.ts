import endpoints from '@/api/endpoints'
import type {
  AcceptInviteRequest,
  CreateFriendRequest,
  DeclineInviteRequest,
  Friend,
  FriendInvite,
  GetFriendsListRaw,
  GetFriendsListResponse,
  MutationSuccessResponse,
  SearchUsersResponse,
  SearchLocalUsersResponse,
} from '@/api/types/friends'
import { requestHelpers } from '@mochi/common'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object'

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? (value as Record<string, unknown>) : undefined

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

const devConsole = globalThis.console

const logUnexpectedStructure = (payload: unknown) => {
  if (import.meta.env.DEV) {
    devConsole?.warn?.('[API] friends response shape unexpected', payload)
  }
}

const pickList = <T>(values: unknown[], keyOrder: string[]): T[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value as T[]
    }

    const record = asRecord(value)
    if (!record) {
      continue
    }

    for (const key of keyOrder) {
      if (!(key in record)) {
        continue
      }

      const candidate = record[key]
      if (candidate === value) {
        continue
      }

      const nested = pickList<T>([candidate], keyOrder)

      if (nested.length) {
        return nested
      }
    }
  }

  return []
}

const normalizeFriendsList = (
  payload: GetFriendsListRaw
): GetFriendsListResponse => {
  if (Array.isArray(payload)) {
    return {
      friends: payload as Friend[],
      received: [],
      sent: [],
    }
  }

  const record = asRecord(payload)
  if (!record) {
    logUnexpectedStructure(payload)
    return { friends: [], received: [], sent: [] }
  }

  const dataRecord = asRecord(record.data)
  const source = dataRecord ?? record

  const friends = Array.isArray(source.friends) ? (source.friends as Friend[]) : []
  
let received: FriendInvite[] = []
  let sent: FriendInvite[] = []
  
  if (Array.isArray(source.invites)) {
    const invites = source.invites as Array<FriendInvite & { direction?: string }>
    received = invites.filter((invite) => invite.direction === 'from')
    sent = invites.filter((invite) => invite.direction === 'to')
  } else {
    // Fallback to legacy format if received/sent are provided directly
    received = Array.isArray(source.received) ? (source.received as FriendInvite[]) : []
    sent = Array.isArray(source.sent) ? (source.sent as FriendInvite[]) : []
  }

  return {
    friends,
    received,
    sent,
    total: toNumber(record.total) ?? toNumber(dataRecord?.total),
    page: toNumber(record.page) ?? toNumber(dataRecord?.page),
    limit: toNumber(record.limit) ?? toNumber(dataRecord?.limit),
  }
}

const listFriends = async (): Promise<GetFriendsListResponse> => {
  const response = await requestHelpers.get<GetFriendsListRaw>(
    endpoints.friends.list
  )
  return normalizeFriendsList(response)
}

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
    }
  )
  return response
}

const searchLocalUsers = async (query: string): Promise<SearchLocalUsersResponse> => {
  const formData = new URLSearchParams()
  formData.append('search', query)

  const response = await requestHelpers.post<SearchLocalUsersResponse>(
    endpoints.users.search,
    formData.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
      }
    )
  )

export interface WelcomeResponse {
  seen: boolean
  count: number
}

const getWelcome = async (): Promise<WelcomeResponse> => {
  return requestHelpers.get<WelcomeResponse>(endpoints.welcome.get)
}

const markWelcomeSeen = async (): Promise<MutationSuccessResponse> => {
  await requestHelpers.post(endpoints.welcome.seen, {})
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
  getWelcome,
  markWelcomeSeen,
}

export type {
  AcceptInviteRequest,
  CreateFriendRequest,
  DeclineInviteRequest,
  Friend,
  FriendInvite,
  GetFriendsListResponse,
  MutationSuccessResponse,
  SearchUsersResponse,
  SearchLocalUsersResponse,
}

export default friendsApi
