// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Check } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  getErrorMessage,
  toastAction,
} from '@mochi/web'
import {
  usePreferencesQuery,
  useSetPreferencesMutation,
} from '@/hooks/useFriends'
import type { InvitePolicy } from '@/api/friends'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useLingui()
  const options: { value: InvitePolicy; label: string; description: string }[] = [
    {
      value: 'notify',
      label: t`Notify me`,
      description: t`Invites appear in invitations and you are sent a notification (default).`,
    },
    {
      value: 'silent',
      label: t`Store silently`,
      description: t`Invites appear in invitations. No notification is sent.`,
    },
    {
      value: 'reject',
      label: t`Reject all`,
      description: t`Invites from unknown senders are dropped. Mutual invites still connect.`,
    },
    {
      value: 'accept',
      label: t`Accept automatically`,
      description: t`All invites are accepted without your approval.`,
    },
  ]
  const { data, isLoading } = usePreferencesQuery()
  const setPolicy = useSetPreferencesMutation()
  const [value, setValue] = useState<InvitePolicy>('notify')

  useEffect(() => {
    if (data?.invite_policy) setValue(data.invite_policy)
  }, [data?.invite_policy])

  const handleSave = async () => {
    try {
      await toastAction(setPolicy.mutateAsync(value), {
        loading: t`Saving...`,
        success: t`Invite policy updated`,
        error: (error) => getErrorMessage(error, t`Failed to save`),
      })
      onOpenChange(false)
    } catch {
      // toastAction already showed error
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle><Trans>Incoming invitations</Trans></DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className='space-y-3 py-2'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
        ) : (
          <RadioGroup
            value={value}
            onValueChange={(v) => setValue(v as InvitePolicy)}
            className='py-2'
          >
            {options.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`invite-policy-${opt.value}`}
                className='flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-hover'
              >
                <RadioGroupItem value={opt.value} id={`invite-policy-${opt.value}`} className='mt-0.5' />
                <div className='flex flex-col gap-0.5'>
                  <Label htmlFor={`invite-policy-${opt.value}`} className='font-medium cursor-pointer'>
                    {opt.label}
                  </Label>
                  <span className='text-muted-foreground text-xs'>{opt.description}</span>
                </div>
              </label>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={setPolicy.isPending}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={handleSave} disabled={setPolicy.isPending || isLoading}>
            <Check className='size-4' />
            <Trans>Save</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
