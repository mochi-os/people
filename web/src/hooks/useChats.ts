import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { chatsApi,
  type CreateChatRequest,
  type CreateChatResponse,
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
