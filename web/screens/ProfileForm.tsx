import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { hobbies, popularHobbies } from '../../shared/hobbies'
import type { Profile } from '../../shared/profile'
import { saveProfile, useMyPortrait } from '../api'

const goalExamples = [
  'Raising seed money for my startup',
  'Making new friends',
  'Looking for a job in product design',
  'Hiring my first engineers',
  'Looking for love',
]

const listed = (text: string, saved: string[], separator: ', ' | '\n') =>
  text === saved.join(separator)
    ? saved
    : [
        ...new Set(
          text
            .split(separator.trim() || separator)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]

export function ProfileForm({
  draft,
  userId,
  saved = false,
}: {
  draft: Profile
  userId: string
  saved?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState({
    headline: draft.headline,
    city: draft.city ?? '',
    bio: draft.bio,
    current_work: draft.current_work,
    expertise: draft.expertise.join(', '),
    interests: draft.interests.join(', '),
    fun_facts: draft.fun_facts.join('\n'),
    background: (draft.background ?? []).join('\n'),
  })
  const [picked, setPicked] = useState(draft.hobbies)
  const [goals, setGoals] = useState(() => goalExamples.map((_, i) => draft.looking_for[i] ?? ''))
  const [aboutMe, setAboutMe] = useState(draft.about_me)
  const [query, setQuery] = useState('')
  const portrait = useMyPortrait(userId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', userId] })
      await navigate({ to: '/', search: saved || undefined })
    },
  })
  const toggle = (hobby: Profile['hobbies'][number]) =>
    setPicked(picked.includes(hobby) ? picked.filter((item) => item !== hobby) : [...picked, hobby])
  const search = query.trim().toLowerCase()
  const shown = search
    ? hobbies.filter((hobby) => hobby.includes(search))
    : [...popularHobbies, ...hobbies.filter((hobby) => !popularHobbies.includes(hobby))]
  const written = goals.filter((goal) => goal.trim()).length
  const expertise = listed(about.expertise, draft.expertise, ', ')
  const interests = listed(about.interests, draft.interests, ', ')
  const funFacts = listed(about.fun_facts, draft.fun_facts, '\n')
  const background = listed(about.background, draft.background ?? [], '\n')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({
      headline: about.headline.trim(),
      city: about.city.trim() || null,
      bio: about.bio.trim(),
      current_work: about.current_work.trim(),
      expertise,
      interests,
      fun_facts: funFacts,
      background,
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
  const field = (name: keyof typeof about) => ({
    value: about[name],
    onChange: (event: { target: { value: string } }) =>
      setAbout({ ...about, [name]: event.target.value }),
  })
  return (
    <form className="form profile" onSubmit={submit}>
      {portrait.data && <img className="portrait" src={portrait.data} alt="" />}
      <h2>{draft.name}</h2>
      {editing ? (
        <>
          <label>
            Headline
            <input maxLength={120} {...field('headline')} />
          </label>
          <label>
            City (optional)
            <input maxLength={80} {...field('city')} />
          </label>
          <label>
            Bio
            <textarea rows={5} maxLength={600} {...field('bio')} />
          </label>
          <label>
            Working on
            <textarea rows={3} maxLength={300} {...field('current_work')} />
          </label>
          <label>
            Expertise
            <span className="muted">Up to 10, separated by commas.</span>
            <textarea rows={2} {...field('expertise')} />
          </label>
          <label>
            Interests
            <span className="muted">Up to 15, separated by commas.</span>
            <textarea rows={2} {...field('interests')} />
          </label>
          <label>
            Fun facts
            <span className="muted">Up to 5, one per line.</span>
            <textarea rows={4} {...field('fun_facts')} />
          </label>
          <label>
            Background
            <span className="muted">
              Where you grew up, schools, past jobs, clubs, awards. Up to 12, one per line.
            </span>
            <textarea rows={6} {...field('background')} />
          </label>
        </>
      ) : (
        <>
          <p>{about.headline}</p>
          {about.city && <p className="muted">{about.city}</p>}
          <p>{about.bio}</p>
          {about.current_work && (
            <p>
              <strong>Working on:</strong> {about.current_work}
            </p>
          )}
          {list('Expertise', expertise)}
          {list('Interests', interests)}
          {list('Fun facts', funFacts)}
          {list('Background', background)}
        </>
      )}
      <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>
        {editing ? 'Done editing' : 'Something wrong? Edit it'}
      </button>
      <fieldset className="hobbies">
        <legend>Pick 3–5 hobbies · {picked.length}/5</legend>
        <input
          type="search"
          placeholder="Search, or scroll the list"
          aria-label="Search hobbies"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
        />
        <div className="choices">
          {[...picked, ...shown.filter((hobby) => !picked.includes(hobby))].map((hobby) => {
            const chosen = picked.includes(hobby)
            return (
              <button
                key={hobby}
                type="button"
                className={chosen ? 'picked' : undefined}
                aria-pressed={chosen}
                disabled={!chosen && picked.length >= 5}
                onClick={() => toggle(hobby)}
              >
                {hobby}
              </button>
            )
          })}
          {search && shown.length === 0 && <p className="muted">No matches</p>}
        </div>
      </fieldset>
      <fieldset className="goals">
        <legend>Looking for · at least 3</legend>
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
        Anything else? (optional)
        <span className="muted">Not shown on your profile.</span>
        <textarea
          rows={5}
          maxLength={1000}
          placeholder="Things the internet doesn’t know. For example: I grew up on a farm in Iowa and still love being outside. I’m 6'5&quot;, quiet in big groups, and funnier one on one. I love long walks on the beach and I can’t stand avocados."
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
      <button
        type="submit"
        className="big primary"
        disabled={
          save.isPending ||
          picked.length < 3 ||
          picked.length > 5 ||
          written < 3 ||
          !about.headline.trim() ||
          !about.bio.trim()
        }
      >
        {saved ? 'Save changes' : 'Send my agent in'}
      </button>
      {save.error && <p className="error">{save.error.message}</p>}
    </form>
  )
}
