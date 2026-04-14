import { useMemo, useRef, useState } from 'react'
import { AuthenticatedLayout, ConfirmDialog, getErrorMessage, type SidebarData, type NavItem, toast } from '@mochi/web'
import { Pencil, Plus, Trash2, User, UserPlus, Users, UsersRound } from 'lucide-react'
import { useGroupsQuery, useDeleteGroupMutation } from '@/hooks/useGroups'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { GroupDialog } from '@/features/groups/group-dialog'
import { MemberDialog } from '@/features/groups/member-dialog'
import { useNavigate } from '@tanstack/react-router'

function PeopleLayoutInner() {
  const { data: groups, error: groupsError } = useGroupsQuery()
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
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  // Use refs to avoid recreating sidebarData on every render
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const deleteMutationRef = useRef(deleteMutation)
  deleteMutationRef.current = deleteMutation
  const setConfirmDeleteRef = useRef(setConfirmDelete)
  setConfirmDeleteRef.current = setConfirmDelete

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
            onClick: () => setConfirmDeleteRef.current({ id: group.id, name: group.name }),
          },
        ],
        open: isCurrentGroup,
      }
    })

    const groupsSectionItems: NavItem[] = [
      {
        title: 'Create group',
        icon: Plus,
        onClick: openCreateGroupDialog,
      },
      ...groupItems,
      ...(groupsError
        ? [
            {
              title: 'Failed to refresh groups',
              onClick: () => void 0,
              className:
                'pointer-events-none h-auto px-2 py-1 text-xs font-medium text-destructive/90 hover:bg-transparent active:bg-transparent',
            } satisfies NavItem,
          ]
        : []),
    ]

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
        items: groupsSectionItems,
      },
    ]

    return { navGroups: groups_section }
  }, [groups, groupId, groupsError, openCreateGroupDialog, openEditGroupDialog, openAddMemberDialog])

  const handleConfirmDelete = () => {
    if (!confirmDelete) return
    deleteMutation.mutate(
      { id: confirmDelete.id },
      {
        onSuccess: () => {
          toast.success('Group deleted')
          setConfirmDelete(null)
          void navigate({ to: '/' })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, 'Failed to delete group'))
        },
      }
    )
  }

  return (
    <>
      <AuthenticatedLayout
        sidebarData={sidebarData}
        usePageHeaderForMobileNav
      />

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

      {/* Delete group confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
        title="Delete group"
        desc={`Delete group "${confirmDelete?.name}"? This cannot be undone.`}
        confirmText="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        handleConfirm={handleConfirmDelete}
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
