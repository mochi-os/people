import { createFileRoute } from '@tanstack/react-router'
import { getEntityFingerprint } from '@mochi/web'
import { Profile } from '@/features/profile'
import { PublicProfile } from '@/features/profile/public'

export const Route = createFileRoute('/_authenticated/')({
  component: IndexPage,
})

function IndexPage() {
  const fingerprint = getEntityFingerprint()
  return fingerprint ? <PublicProfile fingerprint={fingerprint} /> : <Profile />
}
