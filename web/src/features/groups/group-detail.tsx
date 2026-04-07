import { useState, useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { User, UsersRound, X, UserPlus } from 'lucide-react'
import { 
  toast,
  Button,
  ConfirmDialog,
  EmptyState,
  Main,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  usePageTitle,
  getErrorMessage,
  PageHeader,
  Section,
  FieldRow,
  DataChip,
  GeneralError,
  ListSkeleton,
} from '@mochi/web'
import {
  useGroupQuery,
  useRemoveGroupMemberMutation,
} from '@/hooks/useGroups'
import { MemberDialog } from './member-dialog'
import { useSidebarContext } from '@/context/sidebar-context'

export function GroupDetail() {
  const { id } = useParams({ from: '/_authenticated/groups/$id' })
  const navigate = useNavigate()
  const { data, isLoading, error, refetch } = useGroupQuery(id)
  const removeMemberMutation = useRemoveGroupMemberMutation()
  const { setGroupId } = useSidebarContext()
  const goBackToFriends = () => navigate({ to: '/' })

  usePageTitle(data?.group?.name ?? 'Group')

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
          toast.success('Member removed')
          setRemoveMemberDialog({ open: false, member: '', name: '', type: 'user' })
        },
        onError: (error) => {
          toast.error(getErrorMessage(error, 'Failed to remove member'))
        },
      }
    )
  }

  const group = data?.group
  const members = data?.members ?? []

  return (
    <>
      <PageHeader
        title={group?.name ?? 'Group'}
        icon={<UsersRound className='size-4 md:size-5' />}
        description={group?.description}
        back={{ label: 'Back to friends', onFallback: goBackToFriends }}
        actions={
          group ? (
            <Button onClick={() => setAddMemberDialog(true)}>
              <UserPlus className='h-4 w-4 mr-2' />
              Add member
            </Button>
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
            title='Group not found'
            description='This group may have been removed or is unavailable.'
          />
        ) : !group ? null : (
          <>
            <Section title="Identity" description="Core information about this group">
              <div className="divide-y-0">
                <FieldRow label="Group ID">
                  <DataChip value={id} truncate='middle' />
                </FieldRow>
                {group.description && (
                  <FieldRow label="Description">
                    <span className="text-sm text-foreground">{group.description}</span>
                  </FieldRow>
                )}
                <FieldRow label="Members Count">
                  <DataChip value={members.length.toString()} copyable={false} />
                </FieldRow>
              </div>
            </Section>

            <Section title="Members" description="Users and groups that belong to this group">
              {members.length === 0 ? (
                <div className="py-8">
                  <EmptyState
                    icon={User}
                    title="No members"
                    description="Add users or groups to get started"
                  />
                </div>
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className='w-[80px] text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.member}>
                          <TableCell className='font-medium'>{member.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {member.type === 'group' ? (
                                <DataChip value="Group" icon={<UsersRound className='size-3.5' />} copyable={false} />
                              ) : (
                                <DataChip value="User" icon={<User className='size-3.5' />} copyable={false} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant='ghost'
                              size='icon'
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveMember(member.member, member.name, member.type)}
                              aria-label={`Remove ${member.type} ${member.name}`}
                              title={`Remove ${member.type} ${member.name}`}
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
          title="Remove member"
          desc={
            <>
              Are you sure you want to remove{' '}
              <span className='text-foreground font-semibold'>
                {removeMemberDialog.name}
              </span>{' '}
              from this group?
            </>
          }
          confirmText={removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
          destructive
          handleConfirm={confirmRemoveMember}
          isLoading={removeMemberMutation.isPending}
        />

        <MemberDialog
          open={addMemberDialog}
          onOpenChange={setAddMemberDialog}
          groupId={id}
        />
      </Main>
    </>
  )
}
