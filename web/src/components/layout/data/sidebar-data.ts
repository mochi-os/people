import { Users, User } from 'lucide-react'
import { type SidebarData } from '@mochi/common'

// Static sidebar data for CommandMenu (Cmd+K)
// The full dynamic sidebar is built in PeopleLayout
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: '',
      items: [
        {
          title: 'Friends',
          url: '/',
          icon: Users,
        },
        {
          title: 'Invitations',
          url: '/invitations',
          icon: User,
        },
      ],
    },
  ],
}
