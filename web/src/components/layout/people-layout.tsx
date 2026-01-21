import { useMemo, useRef } from 'react'
import { AuthenticatedLayout, getErrorMessage } from '@mochi/common'
import type { SidebarData, NavItem } from '@mochi/common'
import { Pencil, Plus, Trash2, User, UserPlus, Users, UsersRound } from 'lucide-react'
import { useGroupsQuery, useDeleteGroupMutation } from '@/hooks/useGroups'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { GroupDialog } from '@/features/groups/group-dialog'
import { MemberDialog } from '@/features/groups/member-dialog'
import { toast } from '@mochi/common'
import { useNavigate } from '@tanstack/react-router'

function PeopleLayoutInner() {
  const { data: groups } = useGroupsQuery()
  const {
    groupId,
    createGroupDialogOpen,
    closeCreateGroupDialog,
    openCreateGroupDialog,
    editGroupDialogOpen,
    editGroupId,
    closeEditGroupDialog,
    openEditGroupDialog,
    addMemberDialogOpen,
    addMemberGroupId,
    closeAddMemberDialog,
    openAddMemberDialog,
  } = useSidebarContext()
  const navigate = useNavigate()
  const deleteMutation = useDeleteGroupMutation()

  // Use refs to avoid recreating sidebarData on every render
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const deleteMutationRef = useRef(deleteMutation)
  deleteMutationRef.current = deleteMutation

  // Find the group being edited for the dialog
  const editGroup = editGroupId ? groups?.find(g => g.id === editGroupId) : null

  const sidebarData: SidebarData = useMemo(() => {
    // Sort groups alphabetically
    const sortedGroups = [...(groups || [])].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )

    // Build group items with sub-items for actions
    const groupItems: NavItem[] = sortedGroups.map((group) => {
      const isCurrentGroup = groupId === group.id

      // Create delete handler for this group
      const handleDelete = () => {
        if (confirm(`Delete group "${group.name}"? This cannot be undone.`)) {
          deleteMutationRef.current.mutate(
            { id: group.id },
            {
              onSuccess: () => {
                toast.success('Group deleted')
                // Navigate to friends page since there's no groups list
                navigateRef.current({ to: '/' })
              },
              onError: (error) => {
                toast.error(getErrorMessage(error, 'Failed to delete group'))
              },
            }
          )
        }
      }

      return {
        title: group.name,
        url: `/groups/${group.id}` as const,
        icon: UsersRound,
        items: [
          {
            title: 'Add member',
            icon: UserPlus,
            onClick: () => openAddMemberDialog(group.id),
          },
          {
            title: 'Edit',
            icon: Pencil,
            onClick: () => openEditGroupDialog(group.id),
          },
          {
            title: 'Delete',
            icon: Trash2,
            onClick: handleDelete,
          },
        ],
        open: isCurrentGroup,
      }
    })

    const groups_section: SidebarData['navGroups'] = [
      {
        title: 'People',
        items: [
          { title: 'Friends', url: '/', icon: Users },
          { title: 'Invitations', url: '/invitations', icon: User },
        ],
      },
      {
        title: 'Groups',
        separator: true,
        items: [
          {
            title: 'New group',
            icon: Plus,
            onClick: openCreateGroupDialog,
            className: 'bg-primary text-primary-foreground shadow hover:bg-primary/90 hover:text-primary-foreground',
          },
          ...groupItems,
        ],
      },
    ]

    return { navGroups: groups_section }
  }, [groups, groupId, openCreateGroupDialog, openEditGroupDialog, openAddMemberDialog])

  return (
    <>
      <AuthenticatedLayout sidebarData={sidebarData} />

      {/* Create group dialog */}
      <GroupDialog
        open={createGroupDialogOpen}
        onOpenChange={(open) => { if (!open) closeCreateGroupDialog() }}
        group={null}
      />

      {/* Edit group dialog */}
      {editGroup && (
        <GroupDialog
          open={editGroupDialogOpen}
          onOpenChange={(open) => { if (!open) closeEditGroupDialog() }}
          group={editGroup}
        />
      )}

      {/* Add member dialog */}
      {addMemberGroupId && (
        <MemberDialog
          open={addMemberDialogOpen}
          onOpenChange={(open) => { if (!open) closeAddMemberDialog() }}
          groupId={addMemberGroupId}
        />
      )}
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
