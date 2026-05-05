import { useState, useEffect } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useNavigate, useParams } from '@tanstack/react-router'
import { MoreHorizontal, Pencil, Trash2, User, UsersRound, X, UserPlus } from 'lucide-react'
import {
  toast,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  EntityAvatar,
  Main,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  usePageTitle,
  getAppPath,
  getErrorMessage,
  PageHeader,
  Section,
  FieldRow,
  DataChip,
  GeneralError,
  ListSkeleton,
} from '@mochi/web'
import {
  useDeleteGroupMutation,
  useGroupQuery,
  useRemoveGroupMemberMutation,
} from '@/hooks/useGroups'
import { GroupDialog } from './group-dialog'
import { MemberDialog } from './member-dialog'
import { useSidebarContext } from '@/context/sidebar-context'

export function GroupDetail() {
  const { t } = useLingui()
  const { id } = useParams({ from: '/_authenticated/groups/$id' })
  const navigate = useNavigate()
  const appPath = getAppPath()
  const { data, isLoading, error, refetch } = useGroupQuery(id)
  const removeMemberMutation = useRemoveGroupMemberMutation()
  const deleteMutation = useDeleteGroupMutation()
  const { setGroupId } = useSidebarContext()
  const goBackToFriends = () => navigate({ to: '/' })
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  usePageTitle(data?.group?.name ?? t`Group`)

  // Register with sidebar context
  useEffect(() => {
    setGroupId(id)
    return () => setGroupId(null)
  }, [id, setGroupId])

  const [addMemberDialog, setAddMemberDialog] = useState(false)

  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean
    member: string
    name: string
    type: 'user' | 'group'
  }>({ open: false, member: '', name: '', type: 'user' })

  const handleRemoveMember = (member: string, name: string, type: 'user' | 'group') => {
    setRemoveMemberDialog({ open: true, member, name, type })
  }

  const confirmRemoveMember = () => {
    removeMemberMutation.mutate(
      { group: id, member: removeMemberDialog.member },
      {
        onSuccess: () => {
          toast.success(t`Member removed`)
          setRemoveMemberDialog({ open: false, member: '', name: '', type: 'user' })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to remove member`))
        },
      }
    )
  }

  const group = data?.group
  const members = data?.members ?? []

  const handleConfirmDelete = () => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(t`Group deleted`)
          setConfirmDeleteOpen(false)
          void navigate({ to: '/' })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, t`Failed to delete group`))
        },
      }
    )
  }

  return (
    <>
      <PageHeader
        title={group?.name ?? t`Group`}
        icon={<UsersRound className='size-4 md:size-5' />}
        description={group?.description}
        back={{ label: t`Back to friends`, onFallback: goBackToFriends }}
        actions={
          group ? (
            <>
              <Button onClick={() => setAddMemberDialog(true)}>
                <UserPlus className='h-4 w-4 me-2' />
                <Trans>Add member</Trans>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='icon' aria-label={t`Group actions`}>
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                    <Pencil className='h-4 w-4' />
                    <Trans>Edit</Trans>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfirmDeleteOpen(true)}>
                    <Trash2 className='h-4 w-4' />
                    <Trans>Delete</Trans>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />
      <Main className="space-y-6">
        {error ? (
          <GeneralError error={error} minimal mode='inline' reset={refetch} />
        ) : null}
        {isLoading && !data ? (
          <ListSkeleton variant='simple' height='h-14' count={4} />
        ) : !data && !error ? (
          <EmptyState
            icon={UsersRound}
            title={t`Group not found`}
            description={t`This group may have been removed or is unavailable.`}
          />
        ) : !group ? null : (
          <>
            <Section title={t`Identity`} description={t`Core information about this group`}>
              <div className="divide-y-0">
                <FieldRow label={t`Group ID`}>
                  <DataChip value={id} truncate='middle' />
                </FieldRow>
                {group.description && (
                  <FieldRow label={t`Description`}>
                    <span className="text-sm text-foreground">{group.description}</span>
                  </FieldRow>
                )}
                <FieldRow label={t`Members Count`}>
                  <DataChip value={members.length.toString()} copyable={false} />
                </FieldRow>
              </div>
            </Section>

            <Section title={t`Members`} description={t`Users and groups that belong to this group`}>
              {members.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    icon={User}
                    title={t`No members`}
                    description={t`Add users or groups to get started`}
                  />
                </div>
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead><Trans>Member</Trans></TableHead>
                        <TableHead><Trans>Type</Trans></TableHead>
                        <TableHead className='w-[80px] text-end'><Trans>Actions</Trans></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.member}>
                          <TableCell className='font-medium'>
                            <div className='flex items-center gap-2'>
                              {member.type === 'user' && (
                                <EntityAvatar
                                  src={`${appPath}/${member.member}/-/avatar`}
                                  styleUrl={`${appPath}/${member.member}/-/style`}
                                  name={member.name}
                                  size="md"
                                />
                              )}
                              <span className='truncate'>{member.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {member.type === 'group' ? (
                                <DataChip value={t`Group`} icon={<UsersRound className='size-3.5' />} copyable={false} />
                              ) : (
                                <DataChip value={t`User`} icon={<User className='size-3.5' />} copyable={false} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-end">
                            <Button
                              variant='ghost'
                              size='icon'
                              className="h-8 w-8 text-muted-foreground"
                              onClick={() => handleRemoveMember(member.member, member.name, member.type)}
                              aria-label={t`Remove ${member.type} ${member.name}`}
                              title={t`Remove ${member.type} ${member.name}`}
                            >
                              <X className='h-4 w-4' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Section>
          </>
        )}

        <ConfirmDialog
          open={removeMemberDialog.open}
          onOpenChange={(open) => setRemoveMemberDialog({ ...removeMemberDialog, open })}
          title={t`Remove member`}
          desc={
            <Trans>
              Are you sure you want to remove{' '}
              <span className='text-foreground font-semibold'>
                {removeMemberDialog.name}
              </span>{' '}
              from this group?
            </Trans>
          }
          confirmText={removeMemberMutation.isPending ? t`Removing...` : t`Remove Member`}
          destructive
          handleConfirm={confirmRemoveMember}
          isLoading={removeMemberMutation.isPending}
        />

        <MemberDialog
          open={addMemberDialog}
          onOpenChange={setAddMemberDialog}
          groupId={id}
        />

        {group && (
          <GroupDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            group={group}
          />
        )}

        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={t`Delete group`}
          desc={t`Delete group "${group?.name}"? This cannot be undone.`}
          confirmText={t`Delete`}
          destructive
          isLoading={deleteMutation.isPending}
          handleConfirm={handleConfirmDelete}
        />
      </Main>
    </>
  )
}
