import { useState } from 'react'
import { User, UsersRound, Search } from 'lucide-react'
import { toast } from '@mochi/common'
import {
  useAddGroupMemberMutation,
  useGroupsQuery,
} from '@/hooks/useGroups'
import { useSearchLocalUsersQuery } from '@/hooks/useFriends'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  getErrorMessage,
  EmptyState,
} from '@mochi/common'

interface MemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
}

export function MemberDialog({ open, onOpenChange, groupId }: MemberDialogProps) {
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'user' | 'group'>('user')

  const addMemberMutation = useAddGroupMemberMutation()
  const { data: groups } = useGroupsQuery()
  const { data: searchResults, isLoading: searchLoading } = useSearchLocalUsersQuery(userSearch, {
    enabled: userSearch.length >= 1,
  })

  const availableGroups = (groups ?? []).filter((g) => g.id !== groupId)

  const handleAddMember = () => {
    if (activeTab === 'user' && selectedUser) {
      addMemberMutation.mutate(
        { group: groupId, member: selectedUser.id, type: 'user' },
        {
          onSuccess: () => {
            toast.success(`Added ${selectedUser.name} to the group`)
            resetAndClose()
          },
          onError: (error) => {
            toast.error(getErrorMessage(error, 'Failed to add member'))
          },
        }
      )
    } else if (activeTab === 'group' && selectedGroup) {
      addMemberMutation.mutate(
        { group: groupId, member: selectedGroup.id, type: 'group' },
        {
          onSuccess: () => {
            toast.success(`Added ${selectedGroup.name} to the group`)
            resetAndClose()
          },
          onError: (error) => {
            toast.error(getErrorMessage(error, 'Failed to add member'))
          },
        }
      )
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
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Add a user or group as a member of this group.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'user' | 'group')}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='user'>
              <User className='mr-2 h-4 w-4' />
              User
            </TabsTrigger>
            <TabsTrigger value='group'>
              <UsersRound className='mr-2 h-4 w-4' />
              Group
            </TabsTrigger>
          </TabsList>

          <TabsContent value='user' className='mt-4'>
            <div className='space-y-4'>
              <div className='grid gap-2'>
                <Label htmlFor='user-search'>Search users</Label>
                <div className='relative'>
                  <Search className='text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2' />
                  <Input
                    id='user-search'
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setSelectedUser(null)
                    }}
                    placeholder='Type to search...'
                    className='pl-10'
                  />
                </div>
              </div>

              {userSearch.length < 1 ? (
                <p className='text-muted-foreground text-center text-sm'>
                  Type to search users
                </p>
              ) : searchLoading ? (
                <p className='text-muted-foreground text-center text-sm'>
                  Searching...
                </p>
              ) : !searchResults?.results?.length ? (
                <EmptyState
                  icon={User}
                  title="No users found"
                  description="Try searching for a different name"
                  className="py-6"
                />
              ) : (
                <div className='max-h-[200px] space-y-2 overflow-y-auto'>
                  {searchResults.results.map((user) => (
                    <Card
                      key={user.id}
                      className={`cursor-pointer transition-colors ${
                        selectedUser?.id === user.id
                          ? 'border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedUser({ id: user.id, name: user.name })}
                    >
                      <CardContent className='flex items-center gap-2 p-3'>
                        <User className='h-4 w-4' />
                        <span className='font-medium'>{user.name}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {selectedUser && (
                <p className='text-sm'>
                  Selected:{' '}
                  <span className='font-semibold'>{selectedUser.name}</span>
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value='group' className='mt-4'>
            <div className='space-y-4'>
              <Label>Select group</Label>
              {availableGroups.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  title="No other groups"
                  description="All available groups are already added"
                  className="py-6"
                />
              ) : (
                <div className='max-h-[200px] space-y-2 overflow-y-auto'>
                  {availableGroups.map((group) => (
                    <Card
                      key={group.id}
                      className={`cursor-pointer transition-colors ${
                        selectedGroup?.id === group.id
                          ? 'border-primary'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedGroup({ id: group.id, name: group.name })}
                    >
                      <CardContent className='flex items-center gap-2 p-3'>
                        <UsersRound className='h-4 w-4' />
                        <div>
                          <span className='font-medium'>{group.name}</span>
                          {group.description && (
                            <p className='text-muted-foreground text-xs'>
                              {group.description}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {selectedGroup && (
                <p className='text-sm'>
                  Selected:{' '}
                  <span className='font-semibold'>{selectedGroup.name}</span>
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant='outline' onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={handleAddMember} disabled={!canAdd || addMemberMutation.isPending}>
            {addMemberMutation.isPending ? 'Adding...' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
