import { useMemo } from 'react'
import { AuthenticatedLayout, EntityAvatar, useAuthStore, type SidebarData, type NavItem } from '@mochi/web'
import { CircleUserRound, Plus, User, Users, UsersRound } from 'lucide-react'
import { useGroupsQuery } from '@/hooks/useGroups'
import { useFriendsQuery } from '@/hooks/useFriends'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { GroupDialog } from '@/features/groups/group-dialog'

const profileIconCache = new Map<string, React.FC>()

function profileIcon(identityId: string): React.FC {
  let Icon = profileIconCache.get(identityId)
  if (!Icon) {
    Icon = function ProfileIcon() {
      return (
        <EntityAvatar
          src={`/people/${identityId}/-/avatar`}
          styleUrl={`/people/${identityId}/-/style`}
          size="xs"
        />
      )
    }
    Icon.displayName = `ProfileIcon(${identityId})`
    profileIconCache.set(identityId, Icon)
  }
  return Icon
}

function PeopleLayoutInner() {
  const { data: groups, isLoading: groupsLoading } = useGroupsQuery()
  const { data: friendsData } = useFriendsQuery()
  const myIdentity = useAuthStore((s) => s.identity)
  const {
    createGroupDialogOpen,
    closeCreateGroupDialog,
    openCreateGroupDialog,
  } = useSidebarContext()

  const sidebarData: SidebarData = useMemo(() => {
    const sortedGroups = [...(groups || [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    const groupItems: NavItem[] = sortedGroups.map((group) => ({
      title: group.name,
      url: `/groups/${group.id}` as const,
      icon: UsersRound,
    }))

    const pendingInvites = friendsData?.received?.length ?? 0

    const navGroups: SidebarData['navGroups'] = [
      {
        title: 'People',
        items: [
          { title: 'Profile', url: '/profile', icon: myIdentity ? profileIcon(myIdentity) : CircleUserRound },
          { title: 'Friends', url: '/', icon: Users },
          {
            title: 'Invitations',
            url: '/invitations',
            icon: User,
            badge: pendingInvites > 0 ? String(pendingInvites) : undefined,
          },
        ],
      },
      {
        title: 'Groups',
        separator: true,
        items: [
          ...groupItems,
          { title: 'Create group', icon: Plus, onClick: openCreateGroupDialog },
        ],
      },
    ]

    return { navGroups }
  }, [groups, friendsData, myIdentity, openCreateGroupDialog])

  return (
    <>
      <AuthenticatedLayout
        sidebarData={sidebarData}
        usePageHeaderForMobileNav
        isLoadingSidebar={groupsLoading && !groups}
      />

      <GroupDialog
        open={createGroupDialogOpen}
        onOpenChange={(open) => { if (!open) closeCreateGroupDialog() }}
        group={null}
      />
    </>
  )
}

export function PeopleLayout() {
  return (
    <SidebarProvider>
      <PeopleLayoutInner />
    </SidebarProvider>
  )
}
