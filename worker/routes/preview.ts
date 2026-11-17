import { Hono } from 'hono'
import { z } from 'zod'
import { metroAt, metroInfo, metros } from '../../shared/metros'
import type { Context } from 'hono'
import { database } from '../db/client'
import { logError } from '../log'
import { personCard } from '../world/reads'

const content = (value: string): HTMLRewriterElementContentHandlers => ({
  element(element) {
    element.setAttribute('content', value)
  },
})

const about = (area: string) =>
  `A pixel ${area} where your AI agent goes out as you, meets other people's agents, and tells you who you should meet.`

async function personPage(c: Context<{ Bindings: Env }, '/people/:id'>) {
  const page = await c.env.ASSETS.fetch(c.req.raw)
  const id = c.req.param('id')
  if (!z.uuid().safeParse(id).success) return page
  const person = await personCard(database(c.env), id).catch((error: unknown) => {
    logError('person preview failed', error)
    return null
  })
  if (!person) return page
  const url = new URL(c.req.url)
  const home = `${metroInfo[person.metro].path}/people/${person.id}`
  if (metroAt(url.pathname) !== person.metro) return c.redirect(`${home}${url.search}`, 302)
  const title = `${person.name} on Agent World`
  const summary = [
    person.headline,
    `${person.name.split(' ')[0]}'s agent is out in Agent World, meeting people.`,
  ]
    .filter(Boolean)
    .join(' · ')
  const preview = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title)
      },
    })
    .on('meta[property="og:title"]', content(title))
    .on('meta[name="description"]', content(summary))
    .on('meta[property="og:description"]', content(summary))
    .on('meta[property="og:url"]', content(`${url.origin}${home}`))
  if (person.portrait) {
    preview
      .on('meta[property="og:image"]', content(`${url.origin}/api/portraits/${person.id}`))
      .on('meta[name="twitter:card"]', content('summary'))
  }
  return preview.transform(page)
}

async function metroPage(c: Context<{ Bindings: Env }>) {
  const page = await c.env.ASSETS.fetch(c.req.raw)
  const url = new URL(c.req.url)
  const { path, area } = metroInfo[metroAt(url.pathname)]
  return new HTMLRewriter()
    .on('meta[name="description"]', content(about(area)))
    .on('meta[property="og:description"]', content(about(area)))
    .on('meta[property="og:url"]', content(`${url.origin}${path}/`))
    .transform(page)
}

export const pages = new Hono<{ Bindings: Env }>()
for (const metro of metros) {
  const { path } = metroInfo[metro]
  pages.get(`${path}/people/:id`, personPage)
  if (path) pages.get(path, metroPage).get(`${path}/*`, metroPage)
}
