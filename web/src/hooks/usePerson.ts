import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authManager, useAuthStore } from '@mochi/web'
import { personApi } from '@/api/person'

const informationKey = (person: string) => ['person', 'information', person] as const

export function useMyIdentity(): string {
  const identity = useAuthStore((s) => s.identity)
  const token = useAuthStore((s) => s.token)
  useEffect(() => {
    if (token && !identity) {
      void authManager.loadIdentity(true)
    }
  }, [token, identity])
  return identity
}

export function usePersonInformationQuery(person: string) {
  return useQuery({
    queryKey: informationKey(person),
    queryFn: () => personApi.getInformation(person),
    enabled: Boolean(person),
  })
}

export function useSetProfileMutation(person: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profile: string) => personApi.setProfile(person, profile),
    onSuccess: () => qc.invalidateQueries({ queryKey: informationKey(person) }),
  })
}

export function useSetAccentMutation(person: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accent: string) => personApi.setAccent(person, accent),
    onSuccess: () => qc.invalidateQueries({ queryKey: informationKey(person) }),
  })
}

export function useUploadImageMutation(
  person: string,
  slot: 'avatar' | 'banner' | 'favicon'
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      if (slot === 'avatar') return personApi.setAvatar(person, file)
      if (slot === 'banner') return personApi.setBanner(person, file)
      return personApi.setFavicon(person, file)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: informationKey(person) }),
  })
}
