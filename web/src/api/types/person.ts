export interface PersonInformation {
  id: string
  fingerprint: string
  name: string
  privacy: string
  profile: string
  style: { accent?: string }
  avatar: string
  banner: string
  favicon: string
}

export type MutationSuccess = Record<string, unknown>
