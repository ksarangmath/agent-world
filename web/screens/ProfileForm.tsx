import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { hobbies, type Profile } from '../../shared/profile'
import { saveProfile, useMyPortrait } from '../api'

const goalExamples = [
  'Raising seed money for my startup',
  'Making new friends',
  'Looking for a job in product design',
  'Hiring my first engineers',
  'Looking for love',
]

export function ProfileForm({ draft, userId }: { draft: Profile; userId: string }) {
  const [picked, setPicked] = useState(draft.hobbies)
  const [goals, setGoals] = useState(() => goalExamples.map((_, i) => draft.looking_for[i] ?? ''))
  const [aboutMe, setAboutMe] = useState(draft.about_me)
  const portrait = useMyPortrait()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', userId] })
      await navigate({ to: '/' })
    },
  })
  const toggle = (hobby: Profile['hobbies'][number]) =>
    setPicked(picked.includes(hobby) ? picked.filter((item) => item !== hobby) : [...picked, hobby])
  const written = goals.filter((goal) => goal.trim()).length
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({
      hobbies: picked,
      looking_for: goals.map((goal) => goal.replace(/\s+/g, ' ').trim()).filter(Boolean),
      about_me: aboutMe.trim(),
    })
  }
  const list = (label: string, items: string[]) =>
    items.length > 0 && (
      <p>
        <strong>{label}:</strong> {items.join(', ')}
      </p>
    )
  return (
    <form className="form profile" onSubmit={submit}>
      {portrait.data && <img className="portrait" src={portrait.data} alt="" />}
      <h2>{draft.name}</h2>
      <p>{draft.headline}</p>
      {draft.city && <p className="muted">{draft.city}</p>}
      <p>{draft.bio}</p>
      {draft.current_work && (
        <p>
          <strong>Working on:</strong> {draft.current_work}
        </p>
      )}
      {list('Expertise', draft.expertise)}
      {list('Interests', draft.interests)}
      {list('Fun facts', draft.fun_facts)}
      <fieldset className="hobbies">
        <legend>Pick 3 to 10 hobbies ({picked.length} picked)</legend>
        {hobbies.map((hobby) => {
          const chosen = picked.includes(hobby)
          return (
            <button
              key={hobby}
              type="button"
              className={chosen ? 'picked' : undefined}
              aria-pressed={chosen}
              disabled={!chosen && picked.length >= 10}
              onClick={() => toggle(hobby)}
            >
              {hobby}
            </button>
          )
        })}
      </fieldset>
      <fieldset className="goals">
        <legend>What are you looking for? (at least 3, up to 5)</legend>
        <p className="muted">
          Your agent uses these to decide who to meet. For example: I’m a VC meeting founders, or I
          want to pick up a new hobby.
        </p>
        {goalExamples.map((example, i) => (
          <textarea
            key={example}
            rows={2}
            maxLength={100}
            placeholder={example}
            aria-label={`Looking for, ${i + 1} of 5${i < 3 ? ', required' : ''}`}
            value={goals[i]}
            onChange={(event) =>
              setGoals(goals.map((goal, j) => (j === i ? event.target.value : goal)))
            }
          />
        ))}
      </fieldset>
      <label>
        Anything else about you? (optional)
        <span className="muted">
          Be as honest as you can about your personality, what you’re like to talk to, and what you
          care about. Your agent uses it to find people you’ll actually click with.
        </span>
        <textarea
          rows={5}
          maxLength={1000}
          placeholder="I’m an introvert who lights up talking about climbing and compilers…"
          value={aboutMe}
          onChange={(event) => setAboutMe(event.target.value)}
        />
      </label>
      {draft.sources.length > 0 && (
        <details>
          <summary>Where this came from</summary>
          <ul>
            {draft.sources.map((source) => (
              <li key={`${source.field}-${source.url}`}>
                {source.field}: {source.url}
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="submit" disabled={save.isPending || picked.length < 3 || written < 3}>
        Send my agent into the world
      </button>
      {save.error && <p className="error">{save.error.message}</p>}
    </form>
  )
}
