// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EntityAvatar, EntityBanner, markdownUrlTransform } from '@mochi/web'

// A profile is written by the person being viewed, including strangers and
// anonymous readers of the public page, so its images stay on this origin.
const urlTransform = markdownUrlTransform(defaultUrlTransform)

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
        <EntityAvatar src={avatarUrl} name={name} size="2xl" accent={accent} />
        <h1 className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>
          {name}
        </h1>
      </div>
      {profile && (
        <div className="markdown-body p-4 text-sm leading-relaxed">
          <Markdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>{profile}</Markdown>
        </div>
      )}
    </div>
  )
}
