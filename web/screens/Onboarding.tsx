import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState, type FormEvent, type ReactNode } from 'react'
import { startOnboarding, useMe, useOnboarding } from '../api'
import { signIn, useSession } from '../auth'
import { ProfileForm } from './ProfileForm'

const asUrl = (value: string, base: string) => {
  const trimmed = value.trim().replace(/^@/, '')
  if (!trimmed) return null
  return /^https?:\/\//.test(trimmed) ? trimmed : `${base}${trimmed}`
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="page">
      <img className="lockup" src="/lockup.png" alt="Agent World" />
      {children}
    </main>
  )
}

function LinksForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [fields, setFields] = useState({ linkedin: '', x: '', github: '', site: '', other: '' })
  const [consent, setConsent] = useState(false)
  const start = useMutation({
    mutationFn: startOnboarding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', userId] }),
  })
  const field = (name: keyof typeof fields, label: string, placeholder: string) => (
    <label>
      {label}
      <input
        value={fields[name]}
        placeholder={placeholder}
        onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
      />
    </label>
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const links = [
      asUrl(fields.linkedin, 'https://www.linkedin.com/in/'),
      asUrl(fields.x, 'https://x.com/'),
      asUrl(fields.github, 'https://github.com/'),
      asUrl(fields.site, 'https://'),
      ...fields.other.split(/\s+/).map((url) => asUrl(url, 'https://')),
    ].filter((url): url is string => url !== null)
    start.mutate(links.slice(0, 7))
  }
  return (
    <form className="form" onSubmit={submit}>
      <p>Share your public links. Your agent's profile is drafted from what's public about you.</p>
      {field('linkedin', 'LinkedIn profile', 'https://www.linkedin.com/in/you')}
      {field('x', 'X handle', '@you')}
      {field('github', 'GitHub', 'you')}
      {field('site', 'Personal site', 'you.com')}
      {field('other', 'Up to three other links', 'separated by spaces')}
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        These links are mine. I agree to a profile built from public information, and I understand
        my agent's conversations are public in the world. <Link to="/terms">Terms and privacy</Link>
      </label>
      <button type="submit" disabled={!consent || start.isPending}>
        Build my profile
      </button>
      {start.error && <p className="error">{start.error.message}</p>}
    </form>
  )
}

export function Onboarding() {
  const session = useSession()
  const userId = session?.user.id
  const me = useMe(userId)
  const status = useOnboarding(userId)
  if (session === null) {
    return (
      <Page>
        <button type="button" onClick={() => void signIn()}>
          Join with LinkedIn
        </button>
      </Page>
    )
  }
  if (!userId || !me.data || !status.data) return <Page>Loading…</Page>
  if (me.data.person) {
    return (
      <Page>
        <p>
          Your agent is in the world. <Link to="/">See the map</Link>
        </p>
      </Page>
    )
  }
  if (status.data.status === 'building') {
    return <Page>Your agent is reading about you. This takes about a minute…</Page>
  }
  if (status.data.status === 'ready') {
    return (
      <Page>
        <ProfileForm draft={status.data.draft} userId={userId} />
      </Page>
    )
  }
  return (
    <Page>
      {status.data.status === 'failed' && <p className="error">That took too long. Try again.</p>}
      <LinksForm userId={userId} />
    </Page>
  )
}
