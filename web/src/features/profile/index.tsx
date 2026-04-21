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

const PROFILE_MAX = 100 * 1024
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
        <p className="text-muted-foreground p-4 text-sm">Loading…</p>
      </Main>
    )
  }

  if (error) {
    return (
      <Main>
        <PageHeader title="Profile" />
        <GeneralError minimal mode="inline" error={error} reset={() => refetch()} />
      </Main>
    )
  }

  return (
    <Main>
      <PageHeader title="Profile" />
      <div className="mx-auto w-full max-w-2xl space-y-8 p-4">
        {isLoading || !data ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <ProfileEditor person={identity} info={data} />
        )}
      </div>
    </Main>
  )
}

type Info = {
  id: string
  fingerprint: string
  name: string
  profile: string
  style: { accent?: string }
  avatar: string
  banner: string
  favicon: string
}

function ProfileEditor({ person, info }: { person: string; info: Info }) {
  const avatarUrl = info.avatar ? `/${info.fingerprint}/-/avatar?v=${info.avatar}` : null
  const bannerUrl = info.banner ? `/${info.fingerprint}/-/banner?v=${info.banner}` : null
  const faviconUrl = info.favicon ? `/${info.fingerprint}/-/favicon?v=${info.favicon}` : null

  return (
    <>
      <BannerSection person={person} src={bannerUrl} />
      <AvatarSection person={person} name={info.name} src={avatarUrl} />
      <FaviconSection person={person} src={faviconUrl} />
      <ProfileSection person={person} initial={info.profile} />
      <AccentSection person={person} initial={info.style.accent ?? ''} />
    </>
  )
}

function ImageUploader({
  person,
  slot,
  buttonLabel,
}: {
  person: string
  slot: 'avatar' | 'banner' | 'favicon'
  buttonLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useUploadImageMutation(person, slot)
  const maxBytes = SLOT_MAX[slot]

  const handlePick = () => inputRef.current?.click()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    if (file.size > maxBytes) {
      toast.error(`${slot} too large (max ${formatBytes(maxBytes)})`)
      return
    }
    mutation.mutate(file, {
      onSuccess: () => toast.success(`${slot.charAt(0).toUpperCase() + slot.slice(1)} updated`),
      onError: (err) => toast.error(getErrorMessage(err, `Failed to upload ${slot}`)),
    })
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        variant="outline"
        onClick={handlePick}
        disabled={mutation.isPending}
      >
        <Upload className="size-4" />
        {mutation.isPending ? 'Uploading…' : buttonLabel}
      </Button>
      <p className="text-muted-foreground text-xs">
        JPG, PNG, GIF, WebP, SVG · Max {formatBytes(maxBytes)}
      </p>
    </div>
  )
}

function BannerSection({ person, src }: { person: string; src: string | null }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Banner</h2>
      <div className="bg-muted overflow-hidden rounded-lg">
        {src ? (
          <EntityBanner src={src} />
        ) : (
          <div className="text-muted-foreground flex aspect-[3/1] items-center justify-center text-xs">
            <ImageIcon className="mr-2 size-4" />
            No banner set
          </div>
        )}
      </div>
      <ImageUploader person={person} slot="banner" buttonLabel="Upload banner" />
    </section>
  )
}

function AvatarSection({
  person,
  name,
  src,
}: {
  person: string
  name: string
  src: string | null
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Avatar</h2>
      <div className="flex items-center gap-4">
        <EntityAvatar src={src} name={name} size={96} />
        <ImageUploader person={person} slot="avatar" buttonLabel="Upload avatar" />
      </div>
    </section>
  )
}

function FaviconSection({ person, src }: { person: string; src: string | null }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Favicon</h2>
      <div className="flex items-center gap-4">
        <EntityAvatar src={src} size={32} />
        <ImageUploader person={person} slot="favicon" buttonLabel="Upload favicon" />
      </div>
    </section>
  )
}

function ProfileSection({ person, initial }: { person: string; initial: string }) {
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])

  const mutation = useSetProfileMutation(person)
  const dirty = value !== initial
  const tooLong = value.length > PROFILE_MAX

  return (
    <section className="space-y-3">
      <Label htmlFor="profile-markdown">Profile (markdown)</Label>
      <Textarea
        id="profile-markdown"
        rows={10}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          {value.length.toLocaleString()} / {PROFILE_MAX.toLocaleString()} characters
        </p>
        <Button
          disabled={!dirty || tooLong || mutation.isPending}
          onClick={() => {
            mutation.mutate(value, {
              onSuccess: () => toast.success('Profile saved'),
              onError: (err) => toast.error(getErrorMessage(err, 'Failed to save profile')),
            })
          }}
        >
          {mutation.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </section>
  )
}

function AccentSection({ person, initial }: { person: string; initial: string }) {
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])

  const mutation = useSetAccentMutation(person)
  const trimmed = value.trim()
  const valid = trimmed === '' || ACCENT_PATTERN.test(trimmed)
  const dirty = trimmed !== initial

  return (
    <section className="space-y-3">
      <Label htmlFor="accent-colour">Accent colour</Label>
      <div className="flex items-center gap-3">
        <Input
          id="accent-colour"
          value={value}
          placeholder="#3b82f6"
          onChange={(e) => setValue(e.target.value)}
          className="max-w-[200px]"
        />
        {valid && trimmed !== '' && (
          <span
            aria-hidden
            className="border-border inline-block size-8 rounded-full border"
            style={{ backgroundColor: trimmed }}
          />
        )}
        <Button
          disabled={!dirty || !valid || mutation.isPending}
          onClick={() => {
            mutation.mutate(trimmed, {
              onSuccess: () => toast.success('Accent saved'),
              onError: (err) => toast.error(getErrorMessage(err, 'Failed to save accent')),
            })
          }}
        >
          {mutation.isPending ? 'Saving…' : 'Save accent'}
        </Button>
      </div>
      {!valid && (
        <p className="text-destructive text-xs">Use #RGB or #RRGGBB hex format.</p>
      )}
    </section>
  )
}
