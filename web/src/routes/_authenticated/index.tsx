import { createFileRoute } from '@tanstack/react-router'
import { Friends } from '@/features/friends'

interface SearchParams {
  action?: string
}

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    action: typeof search.action === 'string' ? search.action : undefined,
  }),
  component: FriendsPage,
})

function FriendsPage() {
  const { action } = Route.useSearch()
  return <Friends autoAdd={action === 'add'} />
}
