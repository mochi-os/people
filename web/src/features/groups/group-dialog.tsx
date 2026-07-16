// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Plus } from 'lucide-react'
import { toast, ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogDescription, ResponsiveDialogFooter, ResponsiveDialogHeader, ResponsiveDialogTitle, Button, Input, Label, Textarea, getErrorMessage, handlePermissionError, textUnchanged } from '@mochi/web'
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
  const { t } = useLingui()
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

  const editUnchanged =
    isEditing &&
    textUnchanged(name.trim(), group.name) &&
    textUnchanged(description.trim(), group.description || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error(t`Name is required`)
      return
    }

    if (isEditing && editUnchanged) {
      onOpenChange(false)
      return
    }

    const payload = isEditing
      ? { id: group.id, name: name.trim(), description: description.trim() }
      : { name: name.trim(), description: description.trim() }

    const loadingMsg = isEditing ? t`Updating group...` : t`Creating group...`
    const successMsg = isEditing ? t`Group updated` : t`Group created`
    const fallbackError = isEditing
      ? t`Failed to update group`
      : t`Failed to create group`

    const id = toast.loading(loadingMsg)
    try {
      if (isEditing) {
        await updateMutation.mutateAsync(payload as { id: string; name: string; description: string })
      } else {
        await createMutation.mutateAsync(payload as { name: string; description: string })
      }
      toast.dismiss(id)
      toast.success(successMsg)
      onOpenChange(false)
    } catch (error) {
      toast.dismiss(id)
      const data =
        error && typeof error === 'object' && 'data' in error
          ? (error as { data: unknown }).data
          : null
      if (data && handlePermissionError(data)) return
      toast.error(getErrorMessage(error, fallbackError))
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className='sm:max-w-[425px]'>
        <form onSubmit={handleSubmit}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{isEditing ? t`Edit group` : t`Create group`}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {isEditing ? t`Edit group` : t`Create group`}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='grid gap-2'>
              <Label htmlFor='name'><Trans>Name</Trans></Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`Group name`}
                disabled={isPending}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='description'><Trans>Description</Trans></Label>
              <Textarea
                id='description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t`Optional description`}
                disabled={isPending}
                rows={3}
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)} disabled={isPending}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type='submit' disabled={isPending || editUnchanged}>
              {isPending ? t`Saving...` : isEditing ? t`Save` : <><Plus className="me-2 h-4 w-4" /><Trans>Create group</Trans></>}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
