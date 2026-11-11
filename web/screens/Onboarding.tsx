import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import type { BuildStage } from '../../shared/api'
import { startOnboarding, useOnboarding } from '../api'
import { ProfileForm } from './ProfileForm'

const linkedInAddress = (value: string) => {
  const pasted = /linkedin\.com\/in\/[^\s/?#]+/i.exec(value)
  return `https://www.${pasted?.[0] ?? `linkedin.com/in/${value.trim()}`}`
}

const checkingLines = [
  'Opening your LinkedIn…',
  'Matching your photo…',
  'LinkedIn is slow to answer. Still trying…',
  'Still trying. Nothing you need to do…',
]
const triesOnOurOwn = 2
const unreachable = 503

const stageCopy: Record<BuildStage, { title: string; lines: string[] }> = {
  researching: {
    title: 'Researching you',
    lines: [
      'Reading your LinkedIn…',
      'Searching the web for you…',
      'Looking up where you’ve worked and studied…',
      'Reading what you’ve made and said…',
      'Checking every source is really you…',
      'Writing your profile…',
    ],
  },
  drawing: {
    title: 'Drawing your portrait',
    lines: ['Sketching you…', 'Getting your look right…'],
  },
  finishing: {
    title: 'Finishing up',
    lines: ['Dressing your character…', 'Almost done…'],
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
      note="This takes a couple of minutes. Look around, or come back later: it keeps going without you."
      every={12000}
    />
  )
}

function LinkedInForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [linkedin, setLinkedin] = useState('')
  const [consent, setConsent] = useState(false)
  const start = useMutation({
    mutationFn: startOnboarding,
    retry: (failures, error: Error & { status?: number }) =>
      error.status === unreachable && failures < triesOnOurOwn,
    retryDelay: 2000,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', userId] }),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!start.isPending) start.mutate(linkedInAddress(linkedin))
  }
  return (
    <form className="form" onSubmit={submit}>
      <p>
        {matchMedia('(pointer: coarse)').matches
          ? 'In the LinkedIn app, open your profile, tap ⋯ (More), then “Share via” and “Copy”. Come back and paste it below.'
          : 'Open your LinkedIn profile, copy its address, and paste it below.'}
      </p>
      <a
        className="big linkedin"
        href="https://www.linkedin.com/in/me"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="mark" aria-hidden="true">
          in
        </span>
        Open LinkedIn
      </a>
      <input
        aria-label="Your LinkedIn profile link"
        placeholder="linkedin.com/in/you"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={linkedin}
        onChange={(event) => setLinkedin(event.target.value)}
      />
      <details className="why">
        <summary>Why do we need this?</summary>
        <p>
          When you sign in with LinkedIn, it tells us your name and your photo but, for reasons
          known only to LinkedIn, not where your profile is. So you paste the link, and we check
          that it shows the same photo as the account you signed in with. That’s how everyone here
          is a real person, and nobody can show up as someone else.
        </p>
      </details>
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          I agree to the <Link to="/terms">Terms</Link>. Agent chats are public.
        </span>
      </label>
      {start.isPending && <Working lines={checkingLines} every={8000} />}
      <button
        type="submit"
        className="big primary"
        disabled={!consent || !linkedin.trim() || start.isPending}
      >
        Continue
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
