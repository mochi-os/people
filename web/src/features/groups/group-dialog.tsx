import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast, ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogFooter, ResponsiveDialogHeader, ResponsiveDialogTitle, Button, Input, Label, Textarea, getErrorMessage, handlePermissionError } from '@mochi/web'
import {
  useCreateGroupMutation,
  useUpdateGroupMutation,
} from '@/hooks/useGroups'
import type { Group } from '@/api/types/groups'

interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: Group | null
}

export function GroupDialog({ open, onOpenChange, group }: GroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

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
    }
  }, [open, group])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    const handleError = (error: unknown, fallback: string) => {
      const data = error && typeof error === 'object' && 'data' in error
        ? (error as { data: unknown }).data
        : null
      if (data && handlePermissionError(data)) return
      toast.error(getErrorMessage(error, fallback))
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-[425px]'>
        <form onSubmit={handleSubmit}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{isEditing ? 'Edit group' : 'Create group'}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {isEditing ? 'Edit group' : 'Create group'}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
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
          <ResponsiveDialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending}>
              {isPending ? 'Saving...' : isEditing ? 'Save' : <><Plus className="mr-2 h-4 w-4" />Create group</>}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
