import { requestHelpers } from '@mochi/web'
import endpoints from '@/api/endpoints'
import type {
  MutationSuccess,
  PersonInformation,
  PersonStyle,
} from '@/api/types/person'

const getInformation = (person: string): Promise<PersonInformation> =>
  requestHelpers.get<PersonInformation>(endpoints.person.information(person))

const getStyle = (person: string): Promise<PersonStyle> =>
  requestHelpers.get<PersonStyle>(endpoints.person.style(person))

const setProfile = (person: string, profile: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(endpoints.person.profileSet(person), { profile })

const setAccent = (person: string, accent: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(endpoints.person.styleSet(person), { accent })

const setName = (person: string, name: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(endpoints.person.nameSet(person), { name })

const setPrivacy = (person: string, privacy: string): Promise<MutationSuccess> =>
  requestHelpers.post<MutationSuccess>(endpoints.person.privacySet(person), { privacy })

const uploadImage = (
  url: string,
  file: File
): Promise<MutationSuccess> => {
  const form = new FormData()
  form.append('file', file)
  return requestHelpers.post<MutationSuccess>(url, form)
}

const setAvatar = (person: string, file: File) =>
  uploadImage(endpoints.person.avatarSet(person), file)

const setBanner = (person: string, file: File) =>
  uploadImage(endpoints.person.bannerSet(person), file)

const setFavicon = (person: string, file: File) =>
  uploadImage(endpoints.person.faviconSet(person), file)

export const personApi = {
  getInformation,
  getStyle,
  setProfile,
  setAccent,
  setName,
  setPrivacy,
  setAvatar,
  setBanner,
  setFavicon,
}
