import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const commit = '124dd3af4aa3b60e2dd1c507bd4db3f7f80934cc'
const source = `https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/${commit}`
const bodies = ['male', 'female'] as const
const animations = ['walk', 'idle', 'sit'] as const
const materials = ['body', 'hair', 'cloth', 'eye'] as const
const licenseTexts: Record<string, string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'OGA-BY 3.0': 'https://static.opengameart.org/OGA-BY-3.0.txt',
  'OGA-BY 3.0+': 'https://static.opengameart.org/OGA-BY-3.0.txt',
  'CC-BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY 3.0+': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
}

const parts = {
  body: 'body/body',
  head_male: 'head/heads/human/heads_human_male',
  head_female: 'head/heads/human/heads_human_female',
  head_male_elderly: 'head/heads/human/heads_human_male_elderly',
  head_female_elderly: 'head/heads/human/heads_human_female_elderly',
  hair_buzzcut: 'hair/bald/hair_buzzcut',
  hair_balding: 'hair/bald/hair_balding',
  hair_plain: 'hair/short/hair_plain',
  hair_parted: 'hair/short/hair_parted',
  hair_idol: 'hair/short/hair_idol',
  hair_curly_short: 'hair/curly/hair_curly_short',
  hair_afro: 'hair/afro/hair_afro',
  hair_pixie: 'hair/short/hair_pixie',
  hair_curtains: 'hair/short/hair_curtains',
  hair_bob: 'hair/bob/hair_bob',
  hair_long_straight: 'hair/long/hair_long_straight',
  hair_wavy: 'hair/long/hair_wavy',
  hair_curly_long: 'hair/curly/hair_curly_long',
  hair_twists_straight: 'hair/afro/hair_twists_straight',
  hair_dreadlocks_long: 'hair/afro/hair_dreadlocks_long',
  hair_ponytail: 'hair/braids/hair_ponytail',
  hair_topknot_long: 'hair/braids/hair_topknot_long',
  hair_topknot_short: 'hair/braids/hair_topknot_short',
  beard_stubble: 'hair/beards/beards_5oclock_shadow',
  beard_trimmed: 'hair/beards/beards_trimmed',
  beard_full: 'hair/beards/beards_beard',
  mustache: 'hair/mustaches/beards_mustache',
  mustache_french: 'hair/mustaches/beards_french',
  glasses_round: 'headwear/accessories/glasses/facial_glasses_round',
  glasses_square: 'headwear/accessories/glasses/facial_glasses_nerd',
  glasses_sun: 'headwear/accessories/glasses/facial_glasses_sunglasses',
  tshirt: 'torso/shirts/shortsleeve/torso_clothes_tshirt',
  longsleeve: 'torso/shirts/longsleeve/torso_clothes_longsleeve2',
  buttoned: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_buttoned',
  cardigan: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan',
  pants: 'legs/pants/legs_pants',
  shorts: 'legs/shorts/legs_shorts',
  skirt: 'legs/skirts/legs_skirts_plain',
  shoes: 'feet/shoes/feet_shoes_revised',
}

type Definition = {
  recolors?: { material?: string; color_1?: { material: string } }
  credits: { file: string; authors: string[]; licenses: string[]; urls: string[] }[]
  [layer: `layer_${number}`]: { zPos: number } & Partial<Record<(typeof bodies)[number], string>>
}

async function fetchOk(path: string) {
  const response = await fetch(`${source}/${path}`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response
}

await rm('public/lpc', { recursive: true, force: true })
const credits = new Map<string, { authors: string[]; licenses: string[]; urls: string[] }>()
const manifest: Record<
  string,
  { material: string | null; layers: { z: number; male: string; female: string }[] }
> = {}
const sheets = new Set<string>()
for (const [id, definition] of Object.entries(parts)) {
  const json = (await (await fetchOk(`sheet_definitions/${definition}.json`)).json()) as Definition
  for (const credit of json.credits) {
    const licenses = credit.licenses.filter((license) => license in licenseTexts)
    if (licenses.length === 0)
      throw new Error(`${definition}: no allowed license in ${credit.licenses.join(', ')}`)
    credits.set(credit.file, { authors: credit.authors, licenses, urls: credit.urls })
  }
  const layers = Object.entries(json)
    .filter(([key]) => key.startsWith('layer_'))
    .map(([, layer]) => layer as Definition[`layer_${number}`])
    .map((layer) => ({ z: layer.zPos, male: layer.male!, female: layer.female! }))
  if (layers.some((layer) => !layer.male || !layer.female))
    throw new Error(`${definition}: missing a body`)
  for (const layer of layers) for (const body of bodies) sheets.add(layer[body])
  manifest[id] = {
    material: json.recolors?.material ?? json.recolors?.color_1?.material ?? null,
    layers,
  }
}
for (const sheet of sheets) {
  for (const animation of animations) {
    const file = `public/lpc/${sheet}${animation}.png`
    await mkdir(dirname(file), { recursive: true })
    await writeFile(
      file,
      new Uint8Array(await (await fetchOk(`spritesheets/${sheet}${animation}.png`)).arrayBuffer()),
    )
  }
}
const palettes: Record<string, Record<string, string[]>> = {}
const bases: Record<string, string> = {}
for (const material of materials) {
  palettes[material] = (await (
    await fetchOk(`palette_definitions/${material}/${material}_ulpc.json`)
  ).json()) as Record<string, string[]>
  bases[material] = (
    (await (await fetchOk(`palette_definitions/${material}/meta_${material}.json`)).json()) as {
      base: string
    }
  ).base
}
await writeFile(
  'web/map/lpc.json',
  `${JSON.stringify({ commit, parts: manifest, palettes, bases, licenses: licenseTexts, credits: Object.fromEntries(credits) }, null, 2)}\n`,
)
console.log(`${sheets.size} sheets, ${credits.size} credited sources`)
