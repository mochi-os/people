import { useEffect, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  ColourPicker,
  Dialog,
  DialogContent,
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
  shellClipboardWrite,
  toast,
  useFormat,
  usePageTitle,
} from '@mochi/web'
import { Check, Copy, Eye, Image as ImageIcon, Loader2, Pencil, Save, Upload, X } from 'lucide-react'
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

// Matches the server cap (_PROFILE_MAX = 100 * 1024 in people.star).
const PROFILE_MAX = 100 * 1024
const ACCENT_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

// Sanity cap on the *source* file the user picks — well above any real photo.
// Client-side resize brings the actual upload down to a fraction of this.
const SLOT_INPUT_MAX = 50 * 1024 * 1024

export function Profile() {
  const { t } = useLingui()
  usePageTitle(t`Profile`)

  const identity = useMyIdentity()
  const { data, isLoading, error, refetch } = usePersonInformationQuery(identity)

  if (!identity) {
    return (
      <Main>
        <PageHeader title={t`Profile`} />
        <div className="mx-auto w-full max-w-2xl p-4">
          <ProfileSkeleton />
        </div>
      </Main>
    )
  }

  if (error) {
    return (
      <Main>
        <PageHeader title={t`Profile`} />
        <div className="mx-auto w-full max-w-2xl p-4">
          <GeneralError minimal mode="inline" error={error} reset={() => refetch()} />
        </div>
      </Main>
    )
  }

  return (
    <Main>
      <PageHeader title={t`Profile`} />
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
  const { t } = useLingui()
  const avatarUrl = info.avatar ? `/${info.fingerprint}/-/avatar?v=${info.avatar}` : null
  const bannerUrl = info.banner ? `/${info.fingerprint}/-/banner?v=${info.banner}` : null
  const faviconUrl = info.favicon ? `/${info.fingerprint}/-/favicon?v=${info.favicon}` : null

  const [profile, setProfile] = useState(info.profile)
  useEffect(() => setProfile(info.profile), [info.profile])

  const [accent, setAccent] = useState(info.style.accent ?? '')
  useEffect(() => setAccent(info.style.accent ?? ''), [info.style.accent])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(info.name)
  useEffect(() => setNameDraft(info.name), [info.name])

  const profileMutation = useSetProfileMutation(person)
  const accentMutation = useSetAccentMutation(person)
  const nameMutation = useSetNameMutation(person)
  const privacyMutation = useSetPrivacyMutation(person)
  const { formatNumber } = useFormat()

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
      onSuccess: () => toast.success(t`Profile saved`),
      onError: (err) => toast.error(getErrorMessage(err, t`Failed to save profile`)),
    })
  }

  const handleSaveAccent = () => {
    accentMutation.mutate(accentTrimmed, {
      onSuccess: () => toast.success(t`Accent saved`),
      onError: (err) => toast.error(getErrorMessage(err, t`Failed to save accent`)),
    })
  }

  const startNameEdit = () => {
    setNameDraft(info.name)
    setEditingName(true)
  }

  const cancelNameEdit = () => {
    setEditingName(false)
    setNameDraft(info.name)
  }

  const handleSaveName = () => {
    if (!nameDirty) return
    nameMutation.mutate(nameTrimmed, {
      onSuccess: () => {
        toast.success(t`Name saved`)
        setEditingName(false)
      },
      onError: (err) => toast.error(getErrorMessage(err, t`Failed to save name`)),
    })
  }

  const handleTogglePrivacy = (checked: boolean) => {
    privacyMutation.mutate(checked ? 'public' : 'private', {
      onError: (err) => toast.error(getErrorMessage(err, t`Failed to update directory listing`)),
    })
  }

return (
    <div className="bg-card border-border overflow-hidden rounded-lg border shadow-sm">
      {/* ── Banner ─────────────────────────────────────────── */}
      <div className="relative bg-muted overflow-hidden">
        {bannerUrl ? (
          <EntityBanner src={bannerUrl} aspectRatio="3 / 1" />
        ) : (
          <div className="flex aspect-[5/2] min-h-[100px] flex-col items-center justify-center gap-2 text-muted-foreground sm:aspect-[3/1]">
            <ImageIcon className="size-8 opacity-30" />
            <span className="text-xs opacity-50"><Trans>No banner set</Trans></span>
          </div>
        )}
        <div className="absolute top-3 right-3">
          <SlotUploader person={person} slot="banner">
            {(open, pending) => (
              <Button
                variant="outline"
                size="sm"
                onClick={open}
                disabled={pending}
                className="shadow-md"
              >
                <Upload className="size-3.5" />
                {pending ? t`Uploading…` : t`Change banner`}
              </Button>
            )}
          </SlotUploader>
        </div>
      </div>

      {/* ── Identity ───────────────────────────────────────── */}
      <div className="px-5 pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="relative -mt-10 shrink-0" style={{ width: 80, height: 80 }}>
            <div className="ring-card size-full overflow-hidden rounded-full ring-4">
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
                  aria-label={t`Upload avatar`}
                  className="border-border bg-muted text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:ring-ring absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
                >
                  <Upload className="size-3" />
                </button>
              )}
            </SlotUploader>
          </div>
          <Button variant="outline" className="mt-4 shrink-0" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-3.5" />
            <Trans>Preview</Trans>
          </Button>
        </div>
        <div className="mt-2">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nameDirty && !nameMutation.isPending) {
                    e.preventDefault()
                    handleSaveName()
                  } else if (e.key === 'Escape') {
                    cancelNameEdit()
                  }
                }}
                onBlur={() => {
                  if (!nameDirty) cancelNameEdit()
                }}
                className="h-10 max-w-xs text-xl font-semibold"
              />
              <Button
                variant="ghost"
                size="sm"
                className="size-9 shrink-0 p-0"
                onClick={handleSaveName}
                disabled={!nameDirty || nameMutation.isPending}
                aria-label={t`Save name`}
              >
                {nameMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-9 shrink-0 p-0"
                onClick={cancelNameEdit}
                aria-label={t`Cancel`}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <h1 className="min-w-0 truncate text-2xl font-semibold">{info.name}</h1>
              <Button
                variant="ghost"
                size="sm"
                className="size-7 shrink-0 p-0"
                onClick={startNameEdit}
                aria-label={t`Edit name`}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          )}
          <FingerprintRow fingerprint={info.fingerprint} />
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="p-5 space-y-6">

        {/* ── Bio ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="profile-markdown"><Trans>Profile</Trans></Label>
          <Textarea
            id="profile-markdown"
            rows={5}
            value={profile}
            placeholder={t`Markdown supported`}
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
              {formatNumber(profile.length, 0)} / {formatNumber(PROFILE_MAX, 0)}
            </p>
            <Button
              size="sm"
              className="ms-2"
              disabled={!profileDirty || tooLong || profileMutation.isPending}
              onClick={handleSaveProfile}
            >
              <Save className="size-3.5" />
              {profileMutation.isPending ? t`Saving…` : t`Save`}
            </Button>
          </div>
        </div>

        {/* ── Appearance ────────────────────────────────────── */}
        <div className="space-y-3 border-t border-border/60 pt-5">
          <div>
            <p className="text-sm font-medium"><Trans>Appearance</Trans></p>
            <p className="text-muted-foreground text-xs">
              <Trans>Personalise how your profile and app look to others.</Trans>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {/* Accent colour */}
            <div className="space-y-2 sm:col-span-2">
              <Label><Trans>Accent colour</Trans></Label>
              <ColourPicker
                collapsible
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
                    {accentMutation.isPending ? t`Saving…` : t`Save`}
                  </Button>
                }
              />
            </div>

            {/* Favicon */}
            <div className="space-y-2">
              <Label><Trans>Browser icon</Trans></Label>
              <div className="flex items-center gap-3">
                <div className="border-border flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt={t`Favicon`}
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm font-medium">
                      {info.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>
                <SlotUploader person={person} slot="favicon">
                  {(open, pending) => (
                    <Button variant="outline" size="sm" onClick={open} disabled={pending}>
                      <Upload className="size-3.5" />
                      {pending ? t`Uploading…` : t`Upload`}
                    </Button>
                  )}
                </SlotUploader>
              </div>
              <p className="text-muted-foreground text-xs">
                <Trans>Shown in browser tabs.</Trans>
              </p>
            </div>
          </div>
        </div>

        {/* ── Privacy ───────────────────────────────────────── */}
        <div className="space-y-3 border-t border-border/60 pt-5">
          <p className="text-sm font-medium"><Trans>Privacy</Trans></p>
          <div className="border-border/60 flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="privacy-public" className="text-sm font-medium">
                <Trans>Directory listing</Trans>
              </Label>
              <p className="text-muted-foreground text-xs">
                <Trans>Allow others to find you in the directory.</Trans>
              </p>
            </div>
            <Switch
              id="privacy-public"
              checked={info.privacy === 'public'}
              onCheckedChange={handleTogglePrivacy}
              disabled={privacyMutation.isPending}
            />
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle><Trans>Profile preview</Trans></DialogTitle>
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
    </div>
  )
}

function formatFingerprint(fingerprint: string): string {
  if (!fingerprint || fingerprint.length !== 9) return fingerprint
  return `${fingerprint.slice(0, 3)}-${fingerprint.slice(3, 6)}-${fingerprint.slice(6)}`
}

function FingerprintRow({ fingerprint }: { fingerprint: string }) {
  const { t } = useLingui()
  const [copied, setCopied] = useState(false)
  const formatted = formatFingerprint(fingerprint)

  if (!fingerprint) return null

  const handleCopy = async () => {
    const ok = await shellClipboardWrite(formatted)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error(t`Failed to copy`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={t`Copy your ID`}
      className="group text-muted-foreground hover:text-foreground -ms-1 inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-mono text-xs">{formatted}</span>
      {copied ? (
        <Check className="text-primary size-3" />
      ) : (
        <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
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
  const { t } = useLingui()
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useUploadImageMutation(person, slot)
  const [resizing, setResizing] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (file.size > SLOT_INPUT_MAX) {
      toast.error(t`File too large`)
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
      toast.error(getErrorMessage(err, t`Could not process ${slot} image`))
      return
    }
    setResizing(false)
    const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1)
    mutation.mutate(upload, {
      onSuccess: () =>
        toast.success(t`${slotLabel} updated`),
      onError: (err) => toast.error(getErrorMessage(err, t`Failed to upload ${slot}`)),
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

