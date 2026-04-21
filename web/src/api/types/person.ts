export interface PersonInformation {
  id: string
  fingerprint: string
  name: string
  profile: string
  style: { accent?: string }
  avatar: string
  banner: string
  favicon: string
}

export interface PersonStyle {
  accent?: string
}

export type MutationSuccess = Record<string, unknown>
