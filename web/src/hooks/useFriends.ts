import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import friendsApi, {
  type GetFriendsListResponse,
  type MutationSuccessResponse,
  type SearchUsersResponse,
  type SearchLocalUsersResponse,
  type CreateFriendRequest,
  type WelcomeResponse,
} from '@/api/friends'

export const friendKeys = {
  all: () => ['friends'] as const,
  search: (query: string) => ['friends', 'search', query] as const,
  localUsers: (query: string) => ['users', 'search', query] as const,
  welcome: () => ['welcome'] as const,
}

import { useQueryWithError } from '@mochi/common'

export const useFriendsQuery = () => {
  const { data, isLoading, isError, error, ErrorComponent } = useQueryWithError<GetFriendsListResponse, Error>({
    queryKey: friendKeys.all(),
    queryFn: () => friendsApi.list(),
  })

  return { data, isLoading, isError, error, ErrorComponent }
}

interface FriendMutationVariables {
  friendId: string
}

export const useAcceptFriendInviteMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    FriendMutationVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ friendId }) => friendsApi.acceptInvite({ id: friendId }),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useDeclineFriendInviteMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    FriendMutationVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ friendId }) => friendsApi.declineInvite({ id: friendId }),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useRemoveFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    FriendMutationVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ friendId }) => friendsApi.remove(friendId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useSearchUsersQuery = (
  query: string,
  options?: Omit<UseQueryOptions<SearchUsersResponse>, 'queryKey' | 'queryFn'>
) =>
  useQuery<SearchUsersResponse>({
    queryKey: friendKeys.search(query),
    queryFn: () => friendsApi.searchUsers(query),
    ...options,
  })

export const useSearchLocalUsersQuery = (
  query: string,
  options?: Omit<UseQueryOptions<SearchLocalUsersResponse>, 'queryKey' | 'queryFn'>
) =>
  useQuery<SearchLocalUsersResponse>({
    queryKey: friendKeys.localUsers(query),
    queryFn: () => friendsApi.searchLocalUsers(query),
    ...options,
  })

export const useCreateFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    CreateFriendRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: CreateFriendRequest) => friendsApi.create(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useWelcomeQuery = () =>
  useQuery<WelcomeResponse>({
    queryKey: friendKeys.welcome(),
    queryFn: () => friendsApi.getWelcome(),
  })

export const useMarkWelcomeSeenMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => friendsApi.markWelcomeSeen(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendKeys.welcome() })
    },
  })
}
