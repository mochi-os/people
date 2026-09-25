// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { useQueryWithError } from '@mochi/web'
import {
  contactsApi,
  type CreateContactRequest,
  type GetBooksResponse,
  type GetContactResponse,
  type GetContactsResponse,
  type InvitePolicy,
  type MutationSuccessResponse,
  type PreferencesResponse,
  type SearchDirectoryResponse,
  type SearchLocalUsersResponse,
  type UpdateContactRequest,
} from '@/api/contacts'

const contactKeys = {
  all: () => ['contacts'] as const,
  one: (contact: string) => ['contacts', contact] as const,
  books: () => ['books'] as const,
  search: (query: string) => ['contacts', 'search', query] as const,
  localUsers: (query: string) => ['users', 'search', query] as const,
  preferences: () => ['people', 'preferences'] as const,
}

// Every write can move a contact between books, change a book's count or end a
// friendship, so both lists are refetched after any of them.
const useInvalidateContacts = () => {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: contactKeys.all() })
    queryClient.invalidateQueries({ queryKey: contactKeys.books() })
  }
}

export const useContactsQuery = (book?: string) => {
  const { data, isLoading, isError, error, refetch } = useQueryWithError<
    GetContactsResponse,
    Error
  >({
    // The book is not part of the key: one query serves every book view, so
    // the invitations badge and the book pages share a single request.
    queryKey: contactKeys.all(),
    queryFn: () => contactsApi.list(),
  })

  const contacts = book
    ? (data?.contacts ?? []).filter((contact) => contact.book === book)
    : data?.contacts

  return {
    data,
    contacts,
    isLoading,
    isError,
    error,
    refetch,
  }
}

export const useContactQuery = (
  contact: string,
  options?: Omit<UseQueryOptions<GetContactResponse>, 'queryKey' | 'queryFn'>
) =>
  useQuery<GetContactResponse>({
    queryKey: contactKeys.one(contact),
    queryFn: () => contactsApi.get(contact),
    ...options,
  })

export const useBooksQuery = () =>
  useQuery<GetBooksResponse>({
    queryKey: contactKeys.books(),
    queryFn: () => contactsApi.listBooks(),
  })

export const useSearchDirectoryQuery = (
  query: string,
  options?: Omit<
    UseQueryOptions<SearchDirectoryResponse>,
    'queryKey' | 'queryFn'
  >
) =>
  useQuery<SearchDirectoryResponse>({
    queryKey: contactKeys.search(query),
    queryFn: () => contactsApi.search(query),
    ...options,
  })

export const useSearchLocalUsersQuery = (
  query: string,
  options?: Omit<
    UseQueryOptions<SearchLocalUsersResponse>,
    'queryKey' | 'queryFn'
  >
) =>
  useQuery<SearchLocalUsersResponse>({
    queryKey: contactKeys.localUsers(query),
    queryFn: () => contactsApi.searchLocalUsers(query),
    ...options,
  })

export const useCreateContactMutation = (
  options?: UseMutationOptions<
    GetContactResponse,
    unknown,
    CreateContactRequest,
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: CreateContactRequest) => contactsApi.create(payload),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useUpdateContactMutation = (
  options?: UseMutationOptions<
    GetContactResponse,
    unknown,
    UpdateContactRequest,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: UpdateContactRequest) => contactsApi.update(payload),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      queryClient.invalidateQueries({
        queryKey: contactKeys.one(variables.contact),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

interface ContactMutationVariables {
  contact: string
}

export const useDeleteContactMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    ContactMutationVariables,
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ contact }: ContactMutationVariables) =>
      contactsApi.delete(contact),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useCreateBookMutation = () => {
  const invalidate = useInvalidateContacts()
  return useMutation({
    mutationFn: (name: string) => contactsApi.createBook(name),
    onSuccess: invalidate,
  })
}

export const useRenameBookMutation = () => {
  const invalidate = useInvalidateContacts()
  return useMutation({
    mutationFn: (payload: { book: string; name: string }) =>
      contactsApi.renameBook(payload),
    onSuccess: invalidate,
  })
}

export const useDeleteBookMutation = () => {
  const invalidate = useInvalidateContacts()
  return useMutation({
    mutationFn: (book: string) => contactsApi.deleteBook(book),
    onSuccess: invalidate,
  })
}

interface PersonMutationVariables {
  person: string
}

export const useInviteFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    { person: string; name: string; contact?: string },
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: (payload: { person: string; name: string; contact?: string }) =>
      contactsApi.invite(payload),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useAcceptFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    PersonMutationVariables,
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ person }: PersonMutationVariables) =>
      contactsApi.accept(person),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const useIgnoreFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    PersonMutationVariables,
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ person }: PersonMutationVariables) =>
      contactsApi.ignore(person),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

// Ends a friendship, and cancels a sent invitation; the contact stays.
export const useRemoveFriendMutation = (
  options?: UseMutationOptions<
    MutationSuccessResponse,
    unknown,
    PersonMutationVariables,
    unknown
  >
) => {
  const invalidate = useInvalidateContacts()
  const { onSuccess, ...rest } = options ?? {}
  return useMutation({
    mutationFn: ({ person }: PersonMutationVariables) =>
      contactsApi.removeFriend(person),
    onSuccess: (data, variables, context, mutation) => {
      invalidate()
      onSuccess?.(data, variables, context, mutation)
    },
    ...rest,
  })
}

export const usePreferencesQuery = () =>
  useQuery<PreferencesResponse>({
    queryKey: contactKeys.preferences(),
    queryFn: () => contactsApi.getPreferences(),
  })

export const useSetPreferencesMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (policy: InvitePolicy) =>
      contactsApi.setPreferences({ policy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.preferences() })
    },
  })
}
