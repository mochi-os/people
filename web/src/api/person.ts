// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { requestHelpers } from '@mochi/web'
import endpoints from '@/api/endpoints'
import type {
  MutationSuccess,
  PersonInformation,
} from '@/api/types/person'

const suppressMutationErrorToast = {
  mochi: { showGlobalErrorToast: false },
} as const

const getInformation = (person: string): Promise<PersonInformation> =>
  requestHelpers.get<PersonInformation>(endpoints.person.information(person))

const setProfile = (person: string, profile: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(
    endpoints.person.profileSet(person),
    { profile },
    suppressMutationErrorToast
  )

const setAccent = (person: string, accent: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(
    endpoints.person.styleSet(person),
    { accent },
    suppressMutationErrorToast
  )

const setName = (person: string, name: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(
    endpoints.person.nameSet(person),
    { name },
    suppressMutationErrorToast
  )

const setPrivacy = (person: string, privacy: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(
    endpoints.person.privacySet(person),
    { privacy },
    suppressMutationErrorToast
  )

const uploadImage = (
  url: string,
  file: File
): Promise<MutationSuccess> => {
  const form = new FormData()
  form.append('file', file)
  return requestHelpers.post<MutationSuccess>(url, form, suppressMutationErrorToast)
}

const setAvatar = (person: string, file: File) =>
  uploadImage(endpoints.person.avatarSet(person), file)

const setBanner = (person: string, file: File) =>
  uploadImage(endpoints.person.bannerSet(person), file)

const setFavicon = (person: string, file: File) =>
  uploadImage(endpoints.person.faviconSet(person), file)

export const personApi = {
  getInformation,
  setProfile,
  setAccent,
  setName,
  setPrivacy,
  setAvatar,
  setBanner,
  setFavicon,
}
