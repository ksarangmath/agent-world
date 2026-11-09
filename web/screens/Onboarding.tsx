import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BuildStage } from '../../shared/api'
import { startOnboarding, useOnboarding } from '../api'
import { ProfileForm } from './ProfileForm'

const linkedInAddress = (value: string) => {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/linkedin\.com\//i.test(trimmed)) return `https://${trimmed}`
  return `https://www.linkedin.com/in/${trimmed}`
}

const checkingLines = ['Opening your LinkedIn…', 'Matching your photo…']

const stageCopy: Record<BuildStage, { title: string; lines: string[] }> = {
  researching: {
    title: 'Researching you',
    lines: [
      'Reading your LinkedIn…',
      'Searching the web…',
      'Checking every source is you…',
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
      note="About a minute. Feel free to look around."
    />
  )
}

function LinkedInForm({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [linkedin, setLinkedin] = useState('')
  const [consent, setConsent] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const start = useMutation({
    mutationFn: startOnboarding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['onboarding', userId] }),
  })
  const paste = async () => {
    try {
      setLinkedin((await navigator.clipboard.readText()).trim())
    } catch {
      field.current?.focus()
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!start.isPending) start.mutate(linkedInAddress(linkedin))
  }
  return (
    <form className="form join" onSubmit={submit}>
      <div className="steps">
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
        <button type="button" className="big" onClick={() => void paste()}>
          Paste link
        </button>
      </div>
      <input
        ref={field}
        aria-label="Your LinkedIn profile link"
        placeholder="linkedin.com/in/you"
        value={linkedin}
        onChange={(event) => setLinkedin(event.target.value)}
      />
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
      {start.isPending && <Working lines={checkingLines} every={1500} />}
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
