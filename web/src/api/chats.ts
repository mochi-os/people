import endpoints from '@/api/endpoints'
import type {
  CreateChatRequest,
  CreateChatResponse,
  GetNewChatResponse,
} from '@/api/types/chats'
import { requestHelpers } from '@mochi/common'

type CreateChatApiResponse = { data: CreateChatResponse } | CreateChatResponse

const isWrappedResponse = (
  value: CreateChatApiResponse
): value is { data: CreateChatResponse } => {
  return typeof value === 'object' && value !== null && 'data' in value
}

const createChat = async (
  payload: CreateChatRequest
): Promise<CreateChatResponse> => {
  // Send members as a comma-separated string in the 'members' field
  // The backend expects: a.input("members") which it then splits by comma
  const response = (await requestHelpers.post<CreateChatApiResponse>(
    endpoints.chat.create,
    {
      name: payload.name,
      members: payload.participantIds.join(','),
    }
  )) as CreateChatApiResponse

  if (isWrappedResponse(response)) {
    return response.data
  }

  return response
}

export const chatsApi = {
  create: createChat,
  getFriendsForNewChat: async (): Promise<GetNewChatResponse> => {
    const response = (await requestHelpers.get<
      GetNewChatResponse | { data: GetNewChatResponse }
    >(endpoints.chat.new)) as GetNewChatResponse | { data: GetNewChatResponse }

    if (typeof response === 'object' && response !== null && 'data' in response) {
      return response.data
    }

    return response
  },
}

export type { CreateChatRequest, CreateChatResponse, GetNewChatResponse }
