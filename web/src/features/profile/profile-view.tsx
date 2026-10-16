// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Trans } from '@lingui/react/macro'
import {
  EntityAvatar,
  EntityBanner,
  markdownUrlTransform,
  providerName,
  shellNavigateExternal,
  useFormat,
} from '@mochi/web'
import { FileText, MessageSquare } from 'lucide-react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ProfileAccount, ProfileHistory } from '@/api/types/person'

// A profile is written by the person being viewed, including strangers and
// anonymous readers of the public page, so its images stay on this origin.
const urlTransform = markdownUrlTransform(defaultUrlTransform)

interface ProfileViewProps {
  name: string
  profile: string
  accent?: string
  avatarUrl: string | null
  bannerUrl: string | null
  accounts?: ProfileAccount[]
  history?: ProfileHistory[]
}

export function ProfileView({
  name,
  profile,
  accent,
  avatarUrl,
  bannerUrl,
  accounts = [],
  history = [],
}: ProfileViewProps) {
  const styleVars = accent
    ? ({ ['--accent-colour' as string]: accent } as React.CSSProperties)
    : undefined

  return (
    <div className='mx-auto w-full max-w-3xl' style={styleVars}>
      {bannerUrl && <EntityBanner src={bannerUrl} className='rounded-lg' />}
      <div className='flex items-center gap-4 p-4'>
        <EntityAvatar src={avatarUrl} name={name} size='2xl' accent={accent} />
        <h1
          className='text-2xl font-bold'
          style={accent ? { color: accent } : undefined}
        >
          {name}
        </h1>
      </div>
      {/* The person's accounts elsewhere, each a rel="me" link the network
          verifies against a link back from the account. */}
      {accounts.length > 0 && (
        <ul className='flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 text-sm'>
          {accounts
            .filter((account) => /^https:\/\//.test(account.url))
            .map((account) => (
              <li key={account.url}>
                <a
                  href={account.url}
                  rel='me noopener noreferrer'
                  target='_blank'
                  className='text-primary hover:underline'
                >
                  {providerName(account.type)} · {account.identifier}
                </a>
              </li>
            ))}
        </ul>
      )}
      {profile && (
        <div className='markdown-body p-4 text-sm leading-relaxed'>
          <Markdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>
            {profile}
          </Markdown>
        </div>
      )}
      {history.length > 0 && <ProfileHistoryList history={history} />}
    </div>
  )
}

// The person's newest posts and comments in forums, each opening in forums.
function ProfileHistoryList({ history }: { history: ProfileHistory[] }) {
  const { formatTimestamp } = useFormat()
  return (
    <section className='p-4' data-testid='profile-history'>
      <h2 className='text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase'>
        <Trans>Forums</Trans>
      </h2>
      <ul className='space-y-1'>
        {history.map((item) => {
          const url = `/forums/${item.fingerprint || item.forum}/${item.post}`
          return (
            <li key={`${item.kind}:${item.id}`}>
              <a
                href={url}
                onClick={(event) => {
                  event.preventDefault()
                  shellNavigateExternal(url)
                }}
                className='hover:bg-hover flex gap-3 rounded-lg p-2'
              >
                {item.kind === 'post' ? (
                  <FileText className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                ) : (
                  <MessageSquare className='text-muted-foreground mt-0.5 size-4 shrink-0' />
                )}
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>
                    {item.title}
                  </span>
                  {item.kind === 'comment' && item.body && (
                    <span className='text-muted-foreground line-clamp-2 block text-sm'>
                      {item.body}
                    </span>
                  )}
                  <span className='text-muted-foreground block text-xs'>
                    {item.forum_name} · {formatTimestamp(item.created)}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
