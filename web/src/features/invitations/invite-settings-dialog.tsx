import { useEffect, useState } from 'react'
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
  toast,
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

const options: { value: InvitePolicy; label: string; description: string }[] = [
  {
    value: 'notify',
    label: 'Notify me',
    description: 'Invites appear in your Received list and send a notification. (default)',
  },
  {
    value: 'silent',
    label: 'Store silently',
    description: 'Invites appear in your Received list with no notification.',
  },
  {
    value: 'reject',
    label: 'Reject all',
    description: 'Unknown-sender invites are dropped. Mutual invites still connect.',
  },
  {
    value: 'accept',
    label: 'Accept automatically',
    description: 'Every inviter becomes a friend without approval. For broadcast or support accounts.',
  },
]

export function InviteSettingsDialog({ open, onOpenChange }: Props) {
  const { data, isLoading } = usePreferencesQuery()
  const setPolicy = useSetPreferencesMutation()
  const [value, setValue] = useState<InvitePolicy>('notify')

  useEffect(() => {
    if (data?.invite_policy) setValue(data.invite_policy)
  }, [data?.invite_policy])

  const handleSave = () => {
    setPolicy.mutate(value, {
      onSuccess: () => {
        toast.success('Invite policy updated')
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to save'))
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Incoming invitations</DialogTitle>
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
                className='flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50'
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
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={setPolicy.isPending || isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
