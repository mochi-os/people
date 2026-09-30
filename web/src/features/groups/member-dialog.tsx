// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  toastAction,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  Button,
  EntityAvatar,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  getErrorMessage,
  EmptyState,
  GeneralError,
  naturalCompare,
} from '@mochi/web'
import { User, UsersRound, Search, UserPlus } from 'lucide-react'
import endpoints from '@/api/endpoints'
import type { GroupMember } from '@/api/types/groups'
import { useSearchLocalUsersQuery } from '@/hooks/useContacts'
import { useAddGroupMemberMutation, useGroupsQuery } from '@/hooks/useGroups'

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  // The group's current members, so the Group tab offers only the others.
  members: GroupMember[]
}

// One pickable row: a real button, so it can be reached and chosen from the
// keyboard, and pressed while it is the one chosen.
function Choice({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'bg-card flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors',
        selected ? 'border-primary' : 'hover:bg-hover'
      )}
    >
      {children}
    </button>
  )
}

export function MemberDialog({
  open,
  onOpenChange,
  groupId,
  members,
}: MemberDialogProps) {
  const { t } = useLingui()
  const [userSearch, setUserSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<{
    id: string
    name: string
  } | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<{
    id: string
    name: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'user' | 'group'>('user')

  // One directory search per pause, not one per keystroke — the same 300ms the
  // add-friend dialog uses.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(userSearch), 300)
    return () => clearTimeout(timer)
  }, [userSearch])

  const addMemberMutation = useAddGroupMemberMutation()
  const {
    data: groups,
    isLoading: groupsLoading,
    error: groupsError,
    refetch: refetchGroups,
  } = useGroupsQuery()
  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
    refetch: refetchSearch,
  } = useSearchLocalUsersQuery(debouncedSearch, {
    enabled: open && debouncedSearch.length >= 1,
  })

  // Neither the group itself nor a group already in it can be added.
  const availableGroups = useMemo(() => {
    const taken = new Set(members.map((member) => member.member))
    return (groups ?? [])
      .filter((group) => group.id !== groupId && !taken.has(group.id))
      .sort((a, b) => naturalCompare(a.name, b.name))
  }, [groups, groupId, members])
  const users = useMemo(
    () =>
      [...(searchResults?.results ?? [])].sort((a, b) =>
        naturalCompare(a.name, b.name)
      ),
    [searchResults?.results]
  )
  // Until the pause ends there is no search for what is typed, so nothing
  // may be reported as found or not found.
  const waiting = userSearch.trim() !== debouncedSearch.trim()

  const handleAddMember = async () => {
    if (activeTab === 'user' && selectedUser) {
      try {
        await toastAction(
          addMemberMutation.mutateAsync({
            group: groupId,
            member: selectedUser.id,
            type: 'user',
          }),
          {
            loading: t`Adding member...`,
            success: t`Added ${selectedUser.name} to the group`,
            error: (error) => getErrorMessage(error, t`Failed to add member`),
          }
        )
        resetAndClose()
      } catch {
        // toastAction already showed error
      }
    } else if (activeTab === 'group' && selectedGroup) {
      try {
        await toastAction(
          addMemberMutation.mutateAsync({
            group: groupId,
            member: selectedGroup.id,
            type: 'group',
          }),
          {
            loading: t`Adding member...`,
            success: t`Added ${selectedGroup.name} to the group`,
            error: (error) => getErrorMessage(error, t`Failed to add member`),
          }
        )
        resetAndClose()
      } catch {
        // toastAction already showed error
      }
    }
  }

  const resetAndClose = () => {
    setUserSearch('')
    setSelectedUser(null)
    setSelectedGroup(null)
    onOpenChange(false)
  }

  const canAdd =
    (activeTab === 'user' && selectedUser) ||
    (activeTab === 'group' && selectedGroup)

  return (
    <ResponsiveDialog open={open} onOpenChange={resetAndClose}>
      <ResponsiveDialogContent className='sm:max-w-[500px]'>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <Trans>Add member</Trans>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className='sr-only'>
            <Trans>Add member</Trans>
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'user' | 'group')}
        >
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='user'>
              <User className='size-4' />
              <Trans>User</Trans>
            </TabsTrigger>
            <TabsTrigger value='group'>
              <UsersRound className='size-4' />
              <Trans>Group</Trans>
            </TabsTrigger>
          </TabsList>

          <TabsContent value='user' className='mt-4'>
            <div className='space-y-4'>
              <div className='grid gap-2'>
                <Label htmlFor='user-search'>
                  <Trans>Search users</Trans>
                </Label>
                <div className='relative'>
                  <Search className='text-muted-foreground absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                  <Input
                    id='user-search'
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setSelectedUser(null)
                    }}
                    className='ps-10'
                  />
                </div>
              </div>

              {userSearch.trim().length < 1 ? null : searchLoading ||
                waiting ? (
                <p className='text-muted-foreground text-center text-sm'>
                  <Trans>Searching...</Trans>
                </p>
              ) : searchError ? (
                <GeneralError
                  error={searchError}
                  minimal
                  mode='inline'
                  reset={refetchSearch}
                />
              ) : users.length === 0 ? (
                <EmptyState
                  icon={User}
                  title={t`No people found`}
                  className='py-6'
                />
              ) : (
                <div className='max-h-[200px] space-y-2 overflow-y-auto'>
                  {users.map((user) => (
                    <Choice
                      key={user.id}
                      selected={selectedUser?.id === user.id}
                      onSelect={() =>
                        setSelectedUser({ id: user.id, name: user.name })
                      }
                    >
                      <EntityAvatar
                        src={endpoints.person.asset(user.id, 'avatar')}
                        styleUrl={endpoints.person.asset(user.id, 'style')}
                        name={user.name}
                        size='md'
                      />
                      <span className='font-medium'>{user.name}</span>
                    </Choice>
                  ))}
                </div>
              )}

              {selectedUser && (
                <p className='text-sm'>
                  <Trans>
                    Selected:{' '}
                    <span className='font-semibold'>{selectedUser.name}</span>
                  </Trans>
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value='group' className='mt-4'>
            <div className='space-y-4'>
              <Label>
                <Trans>Select group</Trans>
              </Label>
              {groupsLoading ? (
                <p className='text-muted-foreground text-center text-sm'>
                  <Trans>Loading groups...</Trans>
                </p>
              ) : groupsError ? (
                <GeneralError
                  error={groupsError}
                  minimal
                  mode='inline'
                  reset={refetchGroups}
                />
              ) : availableGroups.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  title={t`No other groups`}
                  description={t`All available groups are already added`}
                  className='py-6'
                />
              ) : (
                <div className='max-h-[200px] space-y-2 overflow-y-auto'>
                  {availableGroups.map((group) => (
                    <Choice
                      key={group.id}
                      selected={selectedGroup?.id === group.id}
                      onSelect={() =>
                        setSelectedGroup({ id: group.id, name: group.name })
                      }
                    >
                      <UsersRound className='size-4' />
                      <div>
                        <span className='font-medium'>{group.name}</span>
                        {group.description && (
                          <p className='text-muted-foreground text-xs'>
                            {group.description}
                          </p>
                        )}
                      </div>
                    </Choice>
                  ))}
                </div>
              )}

              {selectedGroup && (
                <p className='text-sm'>
                  <Trans>
                    Selected:{' '}
                    <span className='font-semibold'>{selectedGroup.name}</span>
                  </Trans>
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <ResponsiveDialogFooter>
          <Button variant='outline' onClick={resetAndClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={handleAddMember}
            loading={addMemberMutation.isPending}
            icon={<UserPlus className='size-4' />}
            disabled={!canAdd}
          >
            <Trans>Add member</Trans>
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
