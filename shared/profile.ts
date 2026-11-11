import { z } from 'zod'
import { hobbies } from './hobbies'

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i)
const tag = z.string().trim().min(1).max(40)
const link = z.url({ protocol: /^https?$/ }).max(300)

export const avatarSchema = z.object({
  gender: z.enum(['male', 'female']),
  skin_tone: hexColor,
  eye_color: z.enum(['dark-brown', 'brown', 'hazel', 'green', 'blue', 'gray']),
  hair_color: hexColor,
  hair_style: z.enum([
    'bald',
    'buzzed',
    'receding',
    'short',
    'side-part',
    'quiff',
    'short-curly',
    'afro',
    'pixie',
    'medium',
    'bob',
    'long-straight',
    'long-wavy',
    'long-curly',
    'braids',
    'locs',
    'ponytail',
    'bun',
    'man-bun',
  ]),
  facial_hair: z.enum(['none', 'stubble', 'mustache', 'goatee', 'short-beard', 'full-beard']),
  glasses: z.enum(['none', 'round', 'square', 'sunglasses']),
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
  hobbies: z
    .array(z.enum(hobbies))
    .min(3, 'Pick at least 3 hobbies.')
    .max(5, 'Pick at most 5 hobbies.')
    .refine((list) => new Set(list).size === list.length, 'Pick each hobby once.'),
  looking_for: z
    .array(z.string().trim().min(1).max(100))
    .min(3, 'Say at least 3 things you’re looking for.')
    .max(5),
  about_me: z.string().trim().max(1000),
  avoid: z.string().trim().max(300),
  conversation_style: z.string().trim().max(300),
  fun_facts: z.array(z.string().trim().min(1).max(200)).max(5),
  links: z.array(link).max(7),
  avatar: avatarSchema,
  sources: z.array(z.object({ field: z.string().max(40), url: link })).max(60),
})
export type Profile = z.infer<typeof profileSchema>

export const editableSchema = profileSchema.pick({
  headline: true,
  city: true,
  bio: true,
  current_work: true,
  expertise: true,
  interests: true,
  fun_facts: true,
  hobbies: true,
  looking_for: true,
  about_me: true,
})
export type Editable = z.infer<typeof editableSchema>
