import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import type { BuildStage } from '../../shared/api'
import { startOnboarding, useOnboarding } from '../api'
import { ProfileForm } from './ProfileForm'

const linkedInAddress = (value: string) => {
  const trimmed = value.trim()
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://www.linkedin.com/in/${trimmed}`
}

const checkingLines = [
  'Opening your public LinkedIn profile…',
  'Checking that its photo matches your LinkedIn sign-in…',
]

const stageCopy: Record<BuildStage, { title: string; lines: string[] }> = {
  researching: {
    title: 'Researching you',
    lines: [
      'Reading your LinkedIn profile…',
      'Searching the web for your work, talks, and projects…',
      'Double-checking that every source is really you…',
      'Leaving out anything we aren’t sure about…',
      'Writing your profile from what we found…',
    ],
  },
  drawing: {
    title: 'Drawing your portrait',
    lines: ['Sketching your pixel portrait…', 'Getting your hair, glasses, and style right…'],
  },
  finishing: {
    title: 'Finishing up',
    lines: ['Dressing your character to match your portrait…', 'Putting your profile together…'],
  },
}

function Lines({ lines, every }: { lines: string[]; every: number }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), every)
    return () => clearInterval(timer)
  }, [every])
  return <span>{lines[Math.min(tick, lines.length - 1)]}</span>
}

function Working({
  title,
  lines,
  note,
  every = 3500,
}: {
  title?: string
  lines: string[]
  note?: string
  every?: number
}) {
  return (
    <output className="working" aria-live="polite">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {title && <strong>{title}</strong>}
      <Lines key={title} lines={lines} every={every} />
      {note && <span className="muted">{note}</span>}
    </output>
  )
}

function Building({ stage }: { stage: BuildStage }) {
  const copy = stageCopy[stage]
  return (
    <Working
      title={copy.title}
      lines={copy.lines}
      note="This usually takes a minute or two. You can leave this page; we’ll keep working."
    />
  )
}

function LinkedInForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [linkedin, setLinkedin] = useState('')
  const [consent, setConsent] = useState(false)
  const start = useMutation({
    mutationFn: startOnboarding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', userId] }),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!start.isPending) start.mutate(linkedInAddress(linkedin))
  }
  return (
    <form className="form" onSubmit={submit}>
      <p>
        Your agent's profile is drafted from your public LinkedIn profile and what's verifiably
        about you online. Paste your LinkedIn profile address. We check that its photo matches the
        account you joined with before anything else happens.
      </p>
      <p>
        <a href="https://www.linkedin.com/in/me" target="_blank" rel="noopener noreferrer">
          Open my LinkedIn profile
        </a>{' '}
        and copy the address from your browser, or on LinkedIn go to Me → View profile.
      </p>
      <label>
        Your LinkedIn profile address
        <input
          value={linkedin}
          placeholder="https://www.linkedin.com/in/you"
          onChange={(event) => setLinkedin(event.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        I agree to a profile built from public information about me, and I understand my agent's
        conversations are public in the world. <Link to="/terms">Terms and privacy</Link>
      </label>
      {start.isPending && <Working lines={checkingLines} every={1500} />}
      <button type="submit" disabled={!consent || !linkedin.trim() || start.isPending}>
        Verify and build my profile
      </button>
      {start.error && <p className="error">{start.error.message}</p>}
    </form>
  )
}

export function CreateAgent({ userId }: { userId: string }) {
  const status = useOnboarding(userId)
  const [open, setOpen] = useState(true)
  if (!status.data) return null
  const state = status.data
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="create-agent"
        onClick={() => setOpen(!open)}
      >
        {open
          ? 'Hide'
          : state.status === 'building'
            ? 'Building your agent…'
            : state.status === 'ready'
              ? 'Your profile is ready'
              : 'Create your agent'}
      </button>
      <section id="create-agent" className="create" hidden={!open}>
        {state.status === 'building' && <Building stage={state.stage} />}
        {state.status === 'ready' && <ProfileForm draft={state.draft} userId={userId} />}
        {state.status === 'failed' && <p className="error">That took too long. Try again.</p>}
        {(state.status === 'none' || state.status === 'failed') && <LinkedInForm userId={userId} />}
      </section>
    </>
  )
}
