import { useEffect, useRef, useState } from 'react'
import {
  Button,
  ColourPicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntityAvatar,
  EntityBanner,
  GeneralError,
  Input,
  Label,
  Main,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
  getErrorMessage,
  toast,
  usePageTitle,
} from '@mochi/web'
import { Eye, Image as ImageIcon, Pencil, Save, Upload } from 'lucide-react'
import { ProfileView } from './profile-view'
import {
  useMyIdentity,
  usePersonInformationQuery,
  useSetAccentMutation,
  useSetNameMutation,
  useSetPrivacyMutation,
  useSetProfileMutation,
  useUploadImageMutation,
} from '@/hooks/usePerson'
import type { PersonInformation } from '@/api/types/person'
import { resizeImage, SLOT_RESIZE } from '@/lib/resize-image'

const PROFILE_MAX = 100 * 100
const ACCENT_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Sanity cap on the *source* file the user picks — well above any real photo.
// Client-side resize brings the actual upload down to a fraction of this.
const SLOT_INPUT_MAX = 50 * 1024 * 1024

export function Profile() {
  usePageTitle('Profile')

  const identity = useMyIdentity()
  const { data, isLoading, error, refetch } = usePersonInformationQuery(identity)

  if (!identity) {
    return (
      <Main>
        <PageHeader title="Profile" />
        <div className="mx-auto w-full max-w-2xl p-4">
          <ProfileSkeleton />
        </div>
      </Main>
    )
  }

  if (error) {
    return (
      <Main>
        <PageHeader title="Profile" />
        <div className="mx-auto w-full max-w-2xl p-4">
          <GeneralError minimal mode="inline" error={error} reset={() => refetch()} />
        </div>
      </Main>
    )
  }

  return (
    <Main>
      <PageHeader title="Profile" />
      <div className="mx-auto w-full max-w-2xl p-3 sm:p-4">
        {isLoading || !data ? (
          <ProfileSkeleton />
        ) : (
          <ProfileEditor person={identity} info={data} />
        )}
      </div>
    </Main>
  )
}

function ProfileSkeleton() {
  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm">
      {/* Banner */}
      <Skeleton className="aspect-[3/1] w-full rounded-none" />
      {/* Avatar row */}
      <div className="px-5 pt-3 pb-5 space-y-5">
        <div className="flex items-end gap-3 -mt-10">
          <Skeleton className="size-20 rounded-full shrink-0 ring-4 ring-card" />
          <Skeleton className="mb-1 h-8 w-28" />
        </div>
        {/* Bio */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-2">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-56 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileEditor({ person, info }: { person: string; info: PersonInformation }) {
  const avatarUrl = info.avatar ? `/${info.fingerprint}/-/avatar?v=${info.avatar}` : null
  const bannerUrl = info.banner ? `/${info.fingerprint}/-/banner?v=${info.banner}` : null
  const faviconUrl = info.favicon ? `/${info.fingerprint}/-/favicon?v=${info.favicon}` : null

  const [profile, setProfile] = useState(info.profile)
  useEffect(() => setProfile(info.profile), [info.profile])

  const [accent, setAccent] = useState(info.style.accent ?? '')
  useEffect(() => setAccent(info.style.accent ?? ''), [info.style.accent])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(info.name)
  useEffect(() => setNameDraft(info.name), [info.name])

  const profileMutation = useSetProfileMutation(person)
  const accentMutation = useSetAccentMutation(person)
  const nameMutation = useSetNameMutation(person)
  const privacyMutation = useSetPrivacyMutation(person)

  const profileDirty = profile !== info.profile
  const tooLong = profile.length > PROFILE_MAX
  const progress = Math.min((profile.length / PROFILE_MAX) * 100, 100)

  const accentTrimmed = accent.trim()
  const accentValid = accentTrimmed === '' || ACCENT_PATTERN.test(accentTrimmed)
  const accentDirty = accentTrimmed !== (info.style.accent ?? '')

  const nameTrimmed = nameDraft.trim()
  const nameDirty = nameTrimmed !== info.name && nameTrimmed.length > 0

  const handleSaveProfile = () => {
    profileMutation.mutate(profile, {
      onSuccess: () => toast.success('Profile saved'),
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to save profile')),
    })
  }

  const handleSaveAccent = () => {
    accentMutation.mutate(accentTrimmed, {
      onSuccess: () => toast.success('Accent saved'),
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to save accent')),
    })
  }

  const handleSaveName = () => {
    if (!nameDirty) return
    nameMutation.mutate(nameTrimmed, {
      onSuccess: () => {
        toast.success('Name saved')
        setNameDialogOpen(false)
      },
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to save name')),
    })
  }

  const handleTogglePrivacy = (checked: boolean) => {
    privacyMutation.mutate(checked ? 'public' : 'private', {
      onError: (err) => toast.error(getErrorMessage(err, 'Failed to update directory listing')),
    })
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm">
      <div className="relative" style={{ paddingBottom: 40 }}>
        <div className="relative bg-muted overflow-hidden">
          {bannerUrl ? (
            <EntityBanner src={bannerUrl} aspectRatio="3 / 1" />
          ) : (
            <div className="flex aspect-[5/2] min-h-[100px] flex-col items-center justify-center gap-2 text-muted-foreground sm:aspect-[3/1]">
              <ImageIcon className="size-8 opacity-30" />
              <span className="text-xs opacity-50">No banner set</span>
            </div>
          )}
          <div className="absolute top-3 right-3">
            <SlotUploader person={person} slot="banner">
              {(open, pending) => (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={open}
                  disabled={pending}
                  className="shadow-md"
                >
                  <Upload className="size-3.5" />
                  {pending ? 'Uploading…' : 'Change Banner'}
                </Button>
              )}
            </SlotUploader>
          </div>
        </div>

        <div className="absolute bottom-0 left-5 right-5 flex items-end gap-3">
          <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
            <div className="rounded-full ring-4 ring-card overflow-hidden size-full">
              <EntityAvatar
                src={avatarUrl}
                name={info.name}
                size="2xl"
                accent={accentValid && accentTrimmed ? accentTrimmed : undefined}
              />
            </div>
            <SlotUploader person={person} slot="avatar">
              {(open, pending) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={pending}
                  aria-label="Upload avatar"
                  className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Upload className="size-3" />
                </button>
              )}
            </SlotUploader>
          </div>
          <h1 className="min-w-0 translate-y-2 truncate text-2xl font-semibold">
            {info.name}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            className="translate-y-2"
            onClick={() => setNameDialogOpen(true)}
            aria-label="Edit name"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="p-5 space-y-5">

        {/* ── Bio ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="profile-markdown">Profile</Label>
          <Textarea
            id="profile-markdown"
            rows={5}
            value={profile}
            placeholder="Markdown supported"
            onChange={(e) => setProfile(e.target.value)}
            className={tooLong ? 'border-destructive focus-visible:ring-destructive/30' : ''}
          />
          <div className="flex items-center gap-2">
            <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${tooLong ? 'bg-destructive' : progress > 80 ? 'bg-warning' : 'bg-primary'
                  }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p
              className={`shrink-0 text-xs tabular-nums ${tooLong ? 'text-destructive' : 'text-muted-foreground'
                }`}
            >
              {profile.length.toLocaleString()} / {PROFILE_MAX.toLocaleString()}
            </p>
            <Button
              size="sm"
              className="ml-2"
              disabled={!profileDirty || tooLong || profileMutation.isPending}
              onClick={handleSaveProfile}
            >
              <Save className="size-3.5" />
              {profileMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Accent colour */}
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Accent</p>
            <ColourPicker
              value={accentValid ? accentTrimmed : ''}
              onChange={setAccent}
              onClear={() => setAccent('')}
              actions={
                <Button
                  size="sm"
                  disabled={!accentDirty || !accentValid || accentMutation.isPending}
                  onClick={handleSaveAccent}
                >
                  <Save className="size-3.5" />
                  {accentMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              }
            />
          </div>

          {/* Favicon */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Browser icon</p>
            <div className="flex flex-col items-start gap-2">
              <div className="border-border flex size-8 shrink-0 items-center justify-center overflow-hidden border bg-muted">
                {faviconUrl ? (
                  <img
                    src={faviconUrl}
                    alt="Favicon"
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="text-muted-foreground text-xs font-medium">
                    {info.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
              <SlotUploader person={person} slot="favicon">
                {(open, pending) => (
                  <Button variant="outline" size="sm" onClick={open} disabled={pending}>
                    <Upload className="size-3.5" />
                    {pending ? 'Uploading…' : 'Upload'}
                  </Button>
                )}
              </SlotUploader>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border/40 pt-4">
          <Label htmlFor="privacy-public" className="text-sm font-medium">
            Allow others to find you in directory
          </Label>
          <Switch
            id="privacy-public"
            checked={info.privacy === 'public'}
            onCheckedChange={handleTogglePrivacy}
            disabled={privacyMutation.isPending}
          />
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-3.5" />
            Preview
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profile preview</DialogTitle>
          </DialogHeader>
          <ProfileView
            name={info.name}
            profile={profile}
            accent={accentValid && accentTrimmed !== '' ? accentTrimmed : undefined}
            avatarUrl={avatarUrl}
            bannerUrl={bannerUrl}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={nameDialogOpen}
        onOpenChange={(open) => {
          setNameDialogOpen(open)
          if (!open) setNameDraft(info.name)
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="name-input">Name</Label>
            <Input
              id="name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDirty && !nameMutation.isPending) {
                  e.preventDefault()
                  handleSaveName()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveName} disabled={!nameDirty || nameMutation.isPending}>
              <Save className="size-3.5" />
              {nameMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SlotUploader({
  person,
  slot,
  children,
}: {
  person: string
  slot: 'avatar' | 'banner' | 'favicon'
  children: (open: () => void, pending: boolean) => React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useUploadImageMutation(person, slot)
  const [resizing, setResizing] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (file.size > SLOT_INPUT_MAX) {
      toast.error('File too large')
      return
    }
    setResizing(true)
    let upload: File
    try {
      const opts = SLOT_RESIZE[slot]
      const blob = await resizeImage(file, opts)
      const ext = opts.mime === 'image/png' ? 'png' : opts.mime === 'image/webp' ? 'webp' : 'jpg'
      upload = new File([blob], `${slot}.${ext}`, { type: blob.type })
    } catch (err) {
      setResizing(false)
      toast.error(getErrorMessage(err, `Could not process ${slot} image`))
      return
    }
    setResizing(false)
    mutation.mutate(upload, {
      onSuccess: () =>
        toast.success(`${slot.charAt(0).toUpperCase() + slot.slice(1)} updated`),
      onError: (err) => toast.error(getErrorMessage(err, `Failed to upload ${slot}`)),
    })
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      {children(() => inputRef.current?.click(), resizing || mutation.isPending)}
    </>
  )
}
