import { z } from 'zod'
import { profileSchema } from '../../shared/profile'
import { exaContents, exaSearch } from '../profile/exa'
import { done, refuse, type Outcome } from '../world/events'
import type { Profile } from '../../shared/profile'
import { tool, type Tool } from './tool'

type BuilderCall = {
  env: Env
  links: string[]
  saveDraft: (profile: Profile) => Promise<'saved' | 'needs portrait' | 'replaced'>
}
type PortraitCall = { draw: (description: string) => Promise<Outcome> }

export const builderTools: Record<string, Tool<BuilderCall>> = {
  exa_search: tool(
    'Search the public web. Returns up to 5 results with their page text.',
    z.object({ query: z.string().trim().min(1).max(200) }),
    async ({ env }, input) =>
      done(JSON.stringify(await exaSearch(env.EXA_API_KEY, input.query, 5))),
  ),
  exa_contents: tool(
    'Read the text of up to 5 web pages by URL.',
    z.object({
      urls: z
        .array(z.url({ protocol: /^https?$/ }))
        .min(1)
        .max(5),
    }),
    async ({ env }, input) => done(JSON.stringify(await exaContents(env.EXA_API_KEY, input.urls))),
  ),
  submit_profile: tool(
    'Submit the finished profile. Call it once, at the end.',
    profileSchema.omit({ links: true }),
    async ({ links, saveDraft }, profile) => {
      const result = await saveDraft({ ...profile, links })
      if (result === 'saved') return done('Saved. Your work is done.')
      if (result === 'needs portrait') {
        return refuse('Call draw_portrait and wait for its result before submitting.')
      }
      return refuse('This profile build was replaced by a newer one. Stop here.')
    },
  ),
}

export const portraitTools: Record<string, Tool<PortraitCall>> = {
  draw_portrait: tool(
    "Draw the person's pixel-art portrait from their LinkedIn photo, or from your description when there's no usable photo. Describe how they look: hair, facial hair, glasses, apparent age, skin tone, and anything distinctive, from the photo and your research. Takes up to three minutes. Call it once and wait for the result before submit_profile; if it fails, call it again.",
    z.object({ description: z.string().trim().min(1).max(600) }),
    async ({ draw }, input) => draw(input.description),
  ),
}
