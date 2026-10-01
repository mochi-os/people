// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  toastAction,
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
  getErrorMessage,
  PageHeader,
  Section,
  FieldRow,
  DataChip,
  GeneralError,
  ListSkeleton,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  naturalCompare,
  useFormat,
} from '@mochi/web'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  UserMinus,
  UsersRound,
  X,
  UserPlus,
} from 'lucide-react'
import endpoints from '@/api/endpoints'
import type { GroupMember } from '@/api/types/groups'
import { formatFingerprint } from '@/lib/fingerprint'
import {
  useDeleteGroupMutation,
  useGroupQuery,
  useRemoveGroupMemberMutation,
} from '@/hooks/useGroups'
import { GroupDialog } from './group-dialog'
import { MemberDialog } from './member-dialog'

export function GroupDetail() {
  const { t } = useLingui()
  const { id } = useParams({ from: '/_authenticated/groups/$id' })
  const navigate = useNavigate()
  const { formatNumber } = useFormat()
  const { data, isLoading, error, refetch } = useGroupQuery(id)
  const removeMemberMutation = useRemoveGroupMemberMutation()
  const deleteMutation = useDeleteGroupMutation()
  const goBackToContacts = () => navigate({ to: '/' })
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  usePageTitle(data?.group?.name ?? t`Group`)

  const [addMemberDialog, setAddMemberDialog] = useState(false)

  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean
    member: string
    name: string
  }>({ open: false, member: '', name: '' })

  const handleRemoveMember = (member: string, name: string) => {
    setRemoveMemberDialog({ open: true, member, name })
  }

  // A member the server could not name: a person it cannot look up, or a
  // nested group since deleted.
  const nameOf = (member: GroupMember) =>
    member.name ||
    (member.type === 'group' ? t`Deleted group` : t`Unknown person`)

  const confirmRemoveMember = async () => {
    try {
      await toastAction(
        removeMemberMutation.mutateAsync({
          group: id,
          member: removeMemberDialog.member,
        }),
        {
          loading: t`Removing member...`,
          success: t`Member removed`,
          error: (error) => getErrorMessage(error, t`Failed to remove member`),
        }
      )
      setRemoveMemberDialog({ open: false, member: '', name: '' })
    } catch {
      // toastAction already showed error
    }
  }

  const group = data?.group
  // Sorted here, not in SQL: the server orders by intrinsic columns only, and
  // naturalCompare is case- and accent-insensitive, so "Ana" and "Ána" sit
  // together instead of at opposite ends of the list.
  const members = [...(data?.members ?? [])].sort((a, b) =>
    naturalCompare(nameOf(a), nameOf(b))
  )

  const handleConfirmDelete = async () => {
    try {
      await toastAction(deleteMutation.mutateAsync({ id }), {
        loading: t`Deleting group...`,
        success: t`Group deleted`,
        error: (error) => getErrorMessage(error, t`Failed to delete group`),
      })
      setConfirmDeleteOpen(false)
      void navigate({ to: '/' })
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <>
      <PageHeader
        title={group?.name ?? t`Group`}
        icon={<UsersRound className='size-4 md:size-5' />}
        description={group?.description}
        back={{ label: t`Back to contacts`, onFallback: goBackToContacts }}
        actions={
          group ? (
            <>
              <Button onClick={() => setAddMemberDialog(true)}>
                <UserPlus className='size-4' />
                <Trans>Add member</Trans>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={t`Group actions`}
                  >
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
      <Main className='space-y-6'>
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
            <Section title={t`Identity`}>
              <div className='divide-y-0'>
                {group.description && (
                  <FieldRow label={t`Description`}>
                    <span className='text-foreground text-sm'>
                      {group.description}
                    </span>
                  </FieldRow>
                )}
                <FieldRow label={t`Members count`}>
                  <DataChip
                    value={formatNumber(members.length)}
                    copyable={false}
                  />
                </FieldRow>
              </div>
            </Section>

            <Section title={t`Members`}>
              {members.length === 0 ? (
                <div className='py-8'>
                  <EmptyState
                    icon={User}
                    title={t`No members`}
                    description={t`Add users or groups to get started`}
                  />
                </div>
              ) : (
                <Table bordered={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Trans>Member</Trans>
                      </TableHead>
                      <TableHead>
                        <Trans context='kind'>Type</Trans>
                      </TableHead>
                      <TableHead className='w-[80px] text-end'>
                        <Trans>Actions</Trans>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.member}>
                        <TableCell className='font-medium'>
                          <div className='flex items-center gap-2'>
                            {member.type === 'user' && (
                              <EntityAvatar
                                src={endpoints.person.asset(
                                  member.member,
                                  'avatar'
                                )}
                                styleUrl={endpoints.person.asset(
                                  member.member,
                                  'style'
                                )}
                                name={nameOf(member)}
                                size='md'
                              />
                            )}
                            <div className='flex min-w-0 flex-col'>
                              <span className='truncate'>{nameOf(member)}</span>
                              {!member.name && member.fingerprint && (
                                <span className='text-muted-foreground truncate text-xs font-normal'>
                                  {formatFingerprint(member.fingerprint)}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            {member.type === 'group' ? (
                              <DataChip
                                value={t`Group`}
                                icon={<UsersRound className='size-3.5' />}
                                copyable={false}
                              />
                            ) : (
                              <DataChip
                                value={t`User`}
                                icon={<User className='size-3.5' />}
                                copyable={false}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className='text-end'>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='text-muted-foreground h-8 w-8'
                                onClick={() =>
                                  handleRemoveMember(
                                    member.member,
                                    nameOf(member)
                                  )
                                }
                                aria-label={t`Remove ${nameOf(member)}`}
                              >
                                <X className='h-4 w-4' />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t`Remove ${nameOf(member)}`}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          </>
        )}

        <ConfirmDialog
          open={removeMemberDialog.open}
          onOpenChange={(open) =>
            setRemoveMemberDialog({ ...removeMemberDialog, open })
          }
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
          confirmText={<Trans>Remove member</Trans>}
          icon={<UserMinus className='size-4' />}
          destructive
          handleConfirm={confirmRemoveMember}
          isLoading={removeMemberMutation.isPending}
        />

        <MemberDialog
          open={addMemberDialog}
          onOpenChange={setAddMemberDialog}
          groupId={id}
          members={members}
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
          confirmText={<Trans>Delete</Trans>}
          icon={<Trash2 className='size-4' />}
          destructive
          isLoading={deleteMutation.isPending}
          handleConfirm={handleConfirmDelete}
        />
      </Main>
    </>
  )
}
