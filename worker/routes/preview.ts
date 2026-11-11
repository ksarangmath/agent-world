import { Hono } from 'hono'
import { z } from 'zod'
import { database } from '../db/client'
import { logError } from '../log'
import { personCard } from '../world/reads'

const content = (value: string): HTMLRewriterElementContentHandlers => ({
  element(element) {
    element.setAttribute('content', value)
  },
})

export const personPage = new Hono<{ Bindings: Env }>().get('/:id', async (c) => {
  const page = await c.env.ASSETS.fetch(c.req.raw)
  const id = c.req.param('id')
  if (!z.uuid().safeParse(id).success) return page
  const person = await personCard(database(c.env), id).catch((error: unknown) => {
    logError('person preview failed', error)
    return null
  })
  if (!person) return page
  const title = `${person.name} on Agent World`
  const about = [
    person.headline,
    `${person.name.split(' ')[0]}'s agent is out in Agent World, meeting people.`,
  ]
    .filter(Boolean)
    .join(' · ')
  const { origin } = new URL(c.req.url)
  const preview = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title)
      },
    })
    .on('meta[property="og:title"]', content(title))
    .on('meta[name="description"]', content(about))
    .on('meta[property="og:description"]', content(about))
    .on('meta[property="og:url"]', content(`${origin}/people/${person.id}`))
  if (person.portrait) {
    preview
      .on('meta[property="og:image"]', content(`${origin}/api/portraits/${person.id}`))
      .on('meta[name="twitter:card"]', content('summary'))
  }
  return preview.transform(page)
})
