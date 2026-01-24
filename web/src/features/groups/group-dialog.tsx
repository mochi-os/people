import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from '@mochi/common'
import {
  useCreateGroupMutation,
  useUpdateGroupMutation,
} from '@/hooks/useGroups'
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
  Textarea,
  getErrorMessage,
  PermissionPrompt,
  isPermissionError,
} from '@mochi/common'
import type { Group } from '@/api/types/groups'

// Extract response data from API error
function getErrorData(error: unknown): unknown {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data: unknown }).data
  }
  return null
}

interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: Group | null
}

export function GroupDialog({ open, onOpenChange, group }: GroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissionNeeded, setPermissionNeeded] = useState<string | null>(null)

  const isEditing = !!group
  const createMutation = useCreateGroupMutation()
  const updateMutation = useUpdateGroupMutation()

  useEffect(() => {
    if (open) {
      if (group) {
        setName(group.name)
        setDescription(group.description || '')
      } else {
        setName('')
        setDescription('')
      }
      setPermissionNeeded(null)
    }
  }, [open, group])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    const handleError = (error: unknown, fallback: string) => {
      const permError = isPermissionError(getErrorData(error))
      if (permError) {
        setPermissionNeeded(permError.permission)
      } else {
        toast.error(getErrorMessage(error, fallback))
      }
    }

    if (isEditing) {
      updateMutation.mutate(
        { id: group.id, name: name.trim(), description: description.trim() },
        {
          onSuccess: () => {
            toast.success('Group updated')
            onOpenChange(false)
          },
          onError: (error) => handleError(error, 'Failed to update group'),
        }
      )
    } else {
      createMutation.mutate(
        { name: name.trim(), description: description.trim() },
        {
          onSuccess: () => {
            toast.success('Group created')
            onOpenChange(false)
          },
          onError: (error) => handleError(error, 'Failed to create group'),
        }
      )
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[425px]'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit group' : 'Create group'}</DialogTitle>
            <DialogDescription className="sr-only">
              {isEditing ? 'Edit group' : 'Create group'}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='name'>Name</Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Group name'
                disabled={isPending}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='description'>Description</Label>
              <Textarea
                id='description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='Optional description'
                disabled={isPending}
                rows={3}
              />
            </div>
          </div>
          {permissionNeeded && (
            <PermissionPrompt
              permission={permissionNeeded}
              onDismiss={() => setPermissionNeeded(null)}
            />
          )}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Save' : <><Plus className="mr-2 h-4 w-4" />Create group</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
