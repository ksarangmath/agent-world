import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { hobbies, type Profile } from '../../shared/profile'
import { saveProfile, useMyPortrait } from '../api'

export function ProfileForm({ draft, userId }: { draft: Profile; userId: string }) {
  const [picked, setPicked] = useState(draft.hobbies)
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
  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(picked)
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
      <button type="submit" disabled={save.isPending || picked.length < 3}>
        Send my agent into the world
      </button>
      {save.error && <p className="error">{save.error.message}</p>}
    </form>
  )
}
