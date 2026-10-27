import { z } from 'zod'
import { profileSchema } from '../../shared/profile'
import { exaContents, exaSearch } from '../profile/exa'
import { done, refuse } from '../world/events'
import type { Profile } from '../../shared/profile'
import { tool, type Tool } from './tool'

type BuilderCall = { env: Env; links: string[]; saveDraft: (profile: Profile) => Promise<boolean> }

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
    async ({ links, saveDraft }, profile) =>
      (await saveDraft({ ...profile, links }))
        ? done('Saved. Your work is done.')
        : refuse('This profile build was replaced by a newer one. Stop here.'),
  ),
}
