import {
  useMutation,
  type UseMutationOptions,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { chatsApi,
  type CreateChatRequest,
  type CreateChatResponse,
  type GetNewChatResponse,
} from '@/api/chats'

export const useCreateChatMutation = (
  options?: UseMutationOptions<
    CreateChatResponse,
    unknown,
    CreateChatRequest,
    unknown
  >
) =>
  useMutation({
    mutationFn: (payload: CreateChatRequest) => chatsApi.create(payload),
    ...options,
  })

export const useNewChatFriendsQuery = (
  options?: Pick<UseQueryOptions<GetNewChatResponse>, 'enabled' | 'staleTime' | 'gcTime'>
) =>
  useQuery<GetNewChatResponse>({
    queryKey: ['chats', 'new'],
    queryFn: () => chatsApi.getFriendsForNewChat(),
    ...options,
  })
