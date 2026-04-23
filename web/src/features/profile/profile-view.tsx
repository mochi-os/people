import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EntityAvatar, EntityBanner } from '@mochi/web'

interface ProfileViewProps {
  name: string
  profile: string
  accent?: string
  avatarUrl: string | null
  bannerUrl: string | null
}

export function ProfileView({ name, profile, accent, avatarUrl, bannerUrl }: ProfileViewProps) {
  const styleVars = accent
    ? ({ ['--accent-colour' as string]: accent } as React.CSSProperties)
    : undefined

  return (
    <div className="mx-auto w-full max-w-3xl" style={styleVars}>
      {bannerUrl && <EntityBanner src={bannerUrl} className="rounded-lg" />}
      <div className="flex items-center gap-4 p-4">
        <EntityAvatar src={avatarUrl} name={name} size={96} accent={accent} />
        <h1 className="text-2xl font-semibold" style={accent ? { color: accent } : undefined}>
          {name}
        </h1>
      </div>
      {profile && (
        <div className="markdown-body p-4 text-sm leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]}>{profile}</Markdown>
        </div>
      )}
    </div>
  )
}
