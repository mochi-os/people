import { useEffect, useRef, useState } from 'react'
import {
  Button,
  EntityAvatar,
  EntityBanner,
  GeneralError,
  Input,
  Label,
  Main,
  PageHeader,
  Skeleton,
  Textarea,
  getErrorMessage,
  toast,
  usePageTitle,
} from '@mochi/web'
import { Image as ImageIcon, Upload } from 'lucide-react'
import {
  useMyIdentity,
  usePersonInformationQuery,
  useSetAccentMutation,
  useSetProfileMutation,
  useUploadImageMutation,
} from '@/hooks/usePerson'
import type { PersonInformation } from '@/api/types/person'

const PROFILE_MAX = 100 * 100
const ACCENT_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const SLOT_MAX: Record<'avatar' | 'banner' | 'favicon', number> = {
  avatar: 2 * 1024 * 1024,
  banner: 10 * 1024 * 1024,
  favicon: 64 * 1024,
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return mb === Math.floor(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

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
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
      {/* Banner + avatar — mirrors ProfileEditor structure */}
      <div className="relative" style={{ paddingBottom: 40 }}>
        <Skeleton className="aspect-3/1 w-full rounded-none" />
        <div className="absolute bottom-0 left-5">
          <Skeleton className="size-20 rounded-full ring-4 ring-card" />
        </div>
      </div>
      {/* Content */}
      <div className="p-5 space-y-5">
        {/* Personal Info heading */}
        <Skeleton className="h-4 w-28" />
        {/* Bio */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-1 w-full rounded-full" />
        </div>
        {/* Customization + Accent grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          </div>
        </div>
        {/* Save button */}
        <div className="flex justify-end">
          <Skeleton className="h-9 w-16" />
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

  const profileMutation = useSetProfileMutation(person)
  const accentMutation = useSetAccentMutation(person)

  const profileDirty = profile !== info.profile
  const tooLong = profile.length > PROFILE_MAX
  const progress = Math.min((profile.length / PROFILE_MAX) * 100, 100)

  const accentTrimmed = accent.trim()
  const accentValid = accentTrimmed === '' || ACCENT_PATTERN.test(accentTrimmed)
  const accentDirty = accentTrimmed !== (info.style.accent ?? '')

  const isSaving = profileMutation.isPending || accentMutation.isPending
  const canSave =
    (profileDirty || accentDirty) &&
    !tooLong &&
    (!accentDirty || accentValid) &&
    !isSaving

  const handleSave = async () => {
    try {
      await Promise.all([
        profileDirty ? profileMutation.mutateAsync(profile) : Promise.resolve(),
        accentDirty && accentValid
          ? accentMutation.mutateAsync(accentTrimmed)
          : Promise.resolve(),
      ])
      toast.success('Saved')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save'))
    }
  }

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
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
          <div className="absolute bottom-3 right-3">
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

        <div className="absolute bottom-0 left-5">
          <div className="relative" style={{ width: 80, height: 80 }}>
            <div className="rounded-full ring-4 ring-card overflow-hidden size-full">
              <EntityAvatar src={avatarUrl} name={info.name} size={80} />
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
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="p-5 space-y-5">

        {/* Section heading */}
        <h2 className="text-base font-semibold leading-none">Personal Info</h2>

        {/* ── Bio ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="profile-markdown">Bio (Markdown-supported)</Label>
          <Textarea
            id="profile-markdown"
            rows={5}
            value={profile}
            placeholder="Tell us a little about yourself…"
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
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Favicon */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Customization</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="border-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                {faviconUrl ? (
                  <EntityAvatar src={faviconUrl} size={32} />
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
                    {pending ? 'Uploading…' : 'Upload favicon'}
                  </Button>
                )}
              </SlotUploader>
            </div>
          </div>

          {/* Accent colour */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Accent Color</p>
            <div className="flex items-center gap-2">
              <Label htmlFor="accent-colour" className="sr-only">
                Accent colour
              </Label>
              <Input
                id="accent-colour"
                value={accent}
                placeholder="#3b82f6"
                onChange={(e) => setAccent(e.target.value)}
                spellCheck={false}
                className={`w-28 font-mono text-sm ${!accentValid ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
              />
              <div
                aria-hidden
                className="border-border size-8 shrink-0 rounded-md border transition-colors duration-150"
                style={
                  accentValid && accentTrimmed !== ''
                    ? { backgroundColor: accentTrimmed }
                    : undefined
                }
              />
            </div>
            {!accentValid && (
              <p className="text-destructive text-xs">Use #RGB or #RRGGBB format.</p>
            )}
          </div>
        </div>

        {/* ── Save ──────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Button disabled={!canSave} onClick={() => void handleSave()}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
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
  const maxBytes = SLOT_MAX[slot]

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (file.size > maxBytes) {
      toast.error(`File too large (max ${formatBytes(maxBytes)})`)
      return
    }
    mutation.mutate(file, {
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
      {children(() => inputRef.current?.click(), mutation.isPending)}
    </>
  )
}
