import { useState, useEffect } from 'react'
import { useParams } from '@tanstack/react-router'
import { User, UsersRound, X, UserPlus } from 'lucide-react'
import { 
  toast,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
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
} from '@mochi/common'
import {
  useGroupQuery,
  useRemoveGroupMemberMutation,
} from '@/hooks/useGroups'
import { MemberDialog } from './member-dialog'
import { useSidebarContext } from '@/context/sidebar-context'

export function GroupDetail() {
  const { id } = useParams({ from: '/_authenticated/groups/$id' })
  const { data, isLoading, isError, error } = useGroupQuery(id)
  const removeMemberMutation = useRemoveGroupMemberMutation()
  const { setGroupId } = useSidebarContext()

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

  if (isError) {
    return (
      <Main>
        <div className='flex h-64 flex-col items-center justify-center gap-2'>
          <div className='text-destructive font-medium'>Failed to load group</div>
          <div className='text-muted-foreground text-sm'>
            {getErrorMessage(error, 'Failed to load group')}
          </div>
        </div>
      </Main>
    )
  }

  if (isLoading || !data) {
    return (
      <Main>
        <div className='flex h-64 items-center justify-center'>
          <div className='text-muted-foreground'>Loading group...</div>
        </div>
      </Main>
    )
  }

  const { group, members } = data

  return (
    <>
      <PageHeader
        title={group.name}
        icon={<UsersRound className='size-4 md:size-5' />}
        description={group.description}
        actions={
          <Button onClick={() => setAddMemberDialog(true)}>
            <UserPlus className='h-4 w-4 mr-2' />
            Add member
          </Button>
        }
      />
      <Main className="space-y-6">
        <Section title="Identity" description="Core information about this group">
          <div className="divide-y-0">
            <FieldRow label="Group ID">
              <DataChip value={id} />
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

        <AlertDialog
          open={removeMemberDialog.open}
          onOpenChange={(open) => setRemoveMemberDialog({ ...removeMemberDialog, open })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove member</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{' '}
                <span className='text-foreground font-semibold'>
                  {removeMemberDialog.name}
                </span>{' '}
                from this group?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeMemberMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmRemoveMember}
                disabled={removeMemberMutation.isPending}
              >
                {removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <MemberDialog
          open={addMemberDialog}
          onOpenChange={setAddMemberDialog}
          groupId={id}
        />
      </Main>
    </>
  )
}
