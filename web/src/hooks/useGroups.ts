import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { groupsApi,
  type AddGroupMemberRequest,
  type CreateGroupRequest,
  type Group,
  type GroupMember,
  type RemoveGroupMemberRequest,
  type UpdateGroupRequest,
} from '@/api/groups'

interface MutationSuccessResponse {
  success: boolean
}

export const groupKeys = {
  all: () => ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
}

export const useGroupsQuery = () =>
  useQuery<Group[]>({
    queryKey: groupKeys.all(),
    queryFn: () => groupsApi.list(),
  })

export const useGroupQuery = (id: string) =>
  useQuery<{ group: Group; members: GroupMember[] }>({
    queryKey: groupKeys.detail(id),
    queryFn: () => groupsApi.get(id),
    enabled: !!id,
  })

export const useCreateGroupMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    CreateGroupRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: CreateGroupRequest) => groupsApi.create(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useUpdateGroupMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    UpdateGroupRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: UpdateGroupRequest) => groupsApi.update(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all() })
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(variables.id) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useDeleteGroupMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    { id: string },
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ id }) => groupsApi.delete(id),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useAddGroupMemberMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    AddGroupMemberRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: AddGroupMemberRequest) => groupsApi.addMember(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(variables.group) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useRemoveGroupMemberMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    RemoveGroupMemberRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: RemoveGroupMemberRequest) => groupsApi.removeMember(payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.detail(variables.group) })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}
