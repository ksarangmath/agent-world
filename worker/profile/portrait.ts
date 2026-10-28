import { z } from 'zod'
import type { Image } from '../omnara/inputs'
import { readLimited } from './builder'

const model = 'gpt-image-2.5-sunburst'
const timeoutMs = 180_000
const maxReplyBytes = 8 * 1024 * 1024
const maxPortraitBytes = 2 * 1024 * 1024

const style = `Low resolution: draw it as if on a 48 by 48 pixel canvas, so each pixel is big, blocky, and clearly visible. Cartoon features with rounded, simplified shapes: bigger expressive eyes with one highlight, a tiny simple nose, a small friendly smile, rosy cheeks. Flat cel shading with only 2 or 3 shades per color, bold dark outlines, a small limited palette, no texture, no gradients, no realism.
Use exactly this pose and framing: head and shoulders only, centered, body and face turned toward the viewer, eyes looking at the viewer, shoulders level, arms and hands out of frame. The top of the head sits a little below the top edge, the chin is just below the middle, and the shoulders run off the bottom edge.
Keep what makes them recognizable: hair style and color, skin tone, face shape, eyebrows, facial hair, glasses, and hats they're clearly wearing. Keep their distinctive traits too, drawn in simple cartoon shorthand rather than realistic detail: their apparent age, gray or thinning hair, one or two short lines for wrinkles or smile lines, a few dots for freckles, a strong jaw or round cheeks. Dress them in everyday clothes that suit who they are, such as a t-shirt, sweater, hoodie, button-up shirt, or blazer, in colors that suit them; never default to a jacket. Plain warm cream background, no text.`

const fromPhoto = (description: string) =>
  `Turn the main person in the first image into a stylized pixel-art video game character portrait, like the dialogue portraits in Stardew Valley. Use the photo for their likeness only: ignore its pose, camera angle, distance, crop, background, lighting, helmets, uniforms, and any other people. If their face isn't visible, invent a friendly, plausible face that fits this description: ${description}
${style}`

const fromDescription = (description: string) =>
  `Draw a stylized pixel-art video game character portrait, like the dialogue portraits in Stardew Valley, of a person who looks like this: ${description}
${style}`

const response = z.object({ data: z.array(z.object({ b64_json: z.string().min(1) })).min(1) })

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

export async function drawPortrait(
  apiKey: string,
  photo: Image | null,
  description: string,
): Promise<Uint8Array> {
  const options = {
    size: '1024x1024',
    quality: 'medium',
    output_format: 'webp',
    output_compression: 80,
  }
  const headers = { Authorization: `Bearer ${apiKey}` }
  const signal = AbortSignal.timeout(timeoutMs)
  let reply: Response
  if (photo) {
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', fromPhoto(description))
    form.append('image[]', new Blob([decode(photo.data)], { type: photo.mediaType }), 'photo')
    for (const [key, value] of Object.entries(options)) form.append(key, String(value))
    reply = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers,
      body: form,
      signal,
    })
  } else {
    reply = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: fromDescription(description), ...options }),
      signal,
    })
  }
  const body = await readLimited(reply, maxReplyBytes)
  if (!body) throw new Error('image generation reply is too large')
  const text = new TextDecoder().decode(body)
  if (!reply.ok) throw new Error(`image generation failed: ${reply.status} ${text.slice(0, 300)}`)
  const portrait = decode(response.parse(JSON.parse(text)).data[0]!.b64_json)
  if (portrait.length > maxPortraitBytes) throw new Error('portrait is too large')
  return portrait
}
