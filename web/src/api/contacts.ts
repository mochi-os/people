// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { requestHelpers } from '@mochi/web'
import endpoints from '@/api/endpoints'
import type {
  CreateBookResponse,
  CreateContactRequest,
  GetBooksResponse,
  GetContactResponse,
  GetContactsResponse,
  MutationSuccessResponse,
  SearchDirectoryResponse,
  SearchLocalUsersResponse,
  UpdateContactRequest,
} from '@/api/types/contacts'

const suppressMutationErrorToast = {
  mochi: { showGlobalErrorToast: false },
} as const

const form = {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
} as const

// This is query-owned UI; failures are rendered inline via GeneralError.
const suppressQueryErrorToast = {
  mochi: { showGlobalErrorToast: false },
} as const

const toMutationSuccess = async <T>(
  promise: Promise<T>
): Promise<MutationSuccessResponse> => {
  await promise
  return { success: true }
}

const body = (fields: Record<string, string>) =>
  new URLSearchParams(fields).toString()

// The request helper unwraps the {"data": ...} envelope; action_contacts
// answers exactly this shape.
const listContacts = (book?: string): Promise<GetContactsResponse> =>
  requestHelpers.get<GetContactsResponse>(endpoints.contacts.list, {
    params: book ? { book } : undefined,
  })

const getContact = (contact: string): Promise<GetContactResponse> =>
  requestHelpers.post<GetContactResponse>(
    endpoints.contacts.get,
    body({ contact }),
    { ...form, ...suppressMutationErrorToast }
  )

const createContact = (
  payload: CreateContactRequest
): Promise<GetContactResponse> =>
  requestHelpers.post<GetContactResponse>(endpoints.contacts.create, payload, {
    ...suppressMutationErrorToast,
  })

const updateContact = (
  payload: UpdateContactRequest
): Promise<GetContactResponse> =>
  requestHelpers.post<GetContactResponse>(endpoints.contacts.update, payload, {
    ...suppressMutationErrorToast,
  })

const deleteContact = (contact: string) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.contacts.delete, body({ contact }), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

const searchDirectory = (search: string): Promise<SearchDirectoryResponse> =>
  requestHelpers.post<SearchDirectoryResponse>(
    endpoints.contacts.search,
    body({ search }),
    { ...form, ...suppressQueryErrorToast }
  )

const searchLocalUsers = (search: string): Promise<SearchLocalUsersResponse> =>
  requestHelpers.post<SearchLocalUsersResponse>(
    endpoints.users.search,
    body({ search }),
    { ...form, ...suppressQueryErrorToast }
  )

const listBooks = (): Promise<GetBooksResponse> =>
  requestHelpers.get<GetBooksResponse>(endpoints.books.list)

const createBook = (name: string): Promise<CreateBookResponse> =>
  requestHelpers.post<CreateBookResponse>(
    endpoints.books.create,
    body({ name }),
    {
      ...form,
      ...suppressMutationErrorToast,
    }
  )

const renameBook = (payload: { book: string; name: string }) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.books.rename, body(payload), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

const deleteBook = (book: string) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.books.delete, body({ book }), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

const inviteFriend = (payload: { person: string; name: string; contact?: string }) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.friends.invite, body(payload), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

const acceptFriend = (person: string) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.friends.accept, body({ person }), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

const ignoreFriend = (person: string) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.friends.ignore, body({ person }), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

// Ends the friendship and keeps the contact; also cancels a sent invitation.
const removeFriend = (person: string) =>
  toMutationSuccess(
    requestHelpers.post(endpoints.friends.remove, body({ person }), {
      ...form,
      ...suppressMutationErrorToast,
    })
  )

export type InvitePolicy = 'silent' | 'notify' | 'reject' | 'accept'

export interface PreferencesResponse {
  policy: InvitePolicy
}

const getPreferences = (): Promise<PreferencesResponse> =>
  requestHelpers.get<PreferencesResponse>(endpoints.preferences.get)

const setPreferences = (payload: { policy: InvitePolicy }) =>
  toMutationSuccess(
    requestHelpers.post(
      endpoints.preferences.set,
      body({ policy: payload.policy }),
      { ...form, ...suppressMutationErrorToast }
    )
  )

export const contactsApi = {
  list: listContacts,
  get: getContact,
  create: createContact,
  update: updateContact,
  delete: deleteContact,
  search: searchDirectory,
  searchLocalUsers,
  listBooks,
  createBook,
  renameBook,
  deleteBook,
  invite: inviteFriend,
  accept: acceptFriend,
  ignore: ignoreFriend,
  removeFriend,
  getPreferences,
  setPreferences,
}

export type {
  CreateContactRequest,
  GetBooksResponse,
  GetContactResponse,
  GetContactsResponse,
  MutationSuccessResponse,
  SearchDirectoryResponse,
  SearchLocalUsersResponse,
  UpdateContactRequest,
}
