import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i)
const tag = z.string().trim().min(1).max(40)
const link = z.url({ protocol: /^https?$/ }).max(300)

export const avatarSchema = z.object({
  skin_tone: hexColor,
  hair_color: hexColor,
  hair_style: z.enum(['short', 'medium', 'long', 'curly', 'ponytail', 'bun', 'buzzed', 'bald']),
  facial_hair: z.enum(['none', 'stubble', 'mustache', 'beard']),
  glasses: z.enum(['none', 'glasses', 'sunglasses']),
  top_style: z.enum(['t-shirt', 'shirt', 'sweater', 'hoodie', 'jacket', 'blazer']),
  top_color: hexColor,
  bottom_style: z.enum(['pants', 'shorts', 'skirt']),
  bottom_color: hexColor,
  shoe_color: hexColor,
})
export type Avatar = z.infer<typeof avatarSchema>

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  headline: z.string().trim().min(1).max(120),
  age: z.int().min(1).max(120).nullable(),
  city: z.string().trim().max(80).nullable(),
  bio: z.string().trim().min(1).max(600),
  current_work: z.string().trim().max(300),
  expertise: z.array(tag).max(10),
  interests: z.array(tag).max(15),
  looking_for: z.string().trim().max(500),
  avoid: z.string().trim().max(300),
  conversation_style: z.string().trim().max(300),
  fun_facts: z.array(z.string().trim().min(1).max(200)).max(5),
  links: z.array(link).max(7),
  avatar: avatarSchema,
  sources: z.array(z.object({ field: z.string().max(40), url: link })).max(60),
})
export type Profile = z.infer<typeof profileSchema>
