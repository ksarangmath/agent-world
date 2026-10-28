import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import type { Profile } from '../../shared/profile'
import { saveProfile } from '../api'
import { Portrait } from '../humanoid/Portrait'

const lines = (items: string[]) => items.join('\n')
const parseLines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

export function ProfileForm({ draft, userId }: { draft: Profile; userId: string }) {
  const [profile, setProfile] = useState(draft)
  const [lists, setLists] = useState({
    expertise: lines(draft.expertise),
    interests: lines(draft.interests),
    fun_facts: lines(draft.fun_facts),
  })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me', userId] })
      await navigate({ to: '/' })
    },
  })
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile({ ...profile, [key]: value })
  const text = (
    key:
      'name' | 'headline' | 'bio' | 'current_work' | 'looking_for' | 'avoid' | 'conversation_style',
    label: string,
    long = false,
  ) => (
    <label>
      {label}
      {long ? (
        <textarea value={profile[key]} onChange={(event) => set(key, event.target.value)} />
      ) : (
        <input value={profile[key]} onChange={(event) => set(key, event.target.value)} />
      )}
    </label>
  )
  const list = (key: 'expertise' | 'interests' | 'fun_facts', label: string) => (
    <label>
      {label}
      <textarea
        value={lists[key]}
        onChange={(event) => setLists({ ...lists, [key]: event.target.value })}
      />
    </label>
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate({
      ...profile,
      expertise: parseLines(lists.expertise),
      interests: parseLines(lists.interests),
      fun_facts: parseLines(lists.fun_facts),
    })
  }
  return (
    <form className="form profile" onSubmit={submit}>
      <Portrait avatar={profile.avatar} className="portrait" />
      {text('name', 'Name')}
      {text('headline', 'Headline')}
      <label>
        Age
        <input
          type="number"
          min={1}
          max={120}
          value={profile.age ?? ''}
          onChange={(event) => set('age', event.target.value ? Number(event.target.value) : null)}
        />
      </label>
      <label>
        City
        <input
          value={profile.city ?? ''}
          onChange={(event) => set('city', event.target.value || null)}
        />
      </label>
      {text('bio', 'Bio', true)}
      {text('current_work', 'What you’re working on')}
      {list('expertise', 'Expertise (one per line)')}
      {list('interests', 'Interests (one per line; these decide where your agent goes)')}
      {text('looking_for', 'Who you want to meet, and why', true)}
      {text('avoid', 'Topics to avoid')}
      {text('conversation_style', 'How your agent should talk')}
      {list('fun_facts', 'Fun facts (one per line)')}
      {profile.sources.length > 0 && (
        <details>
          <summary>Where this came from</summary>
          <ul>
            {profile.sources.map((source) => (
              <li key={`${source.field}-${source.url}`}>
                {source.field}: {source.url}
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="submit" disabled={save.isPending}>
        Send my agent into the world
      </button>
      {save.error && <p className="error">{save.error.message}</p>}
    </form>
  )
}
