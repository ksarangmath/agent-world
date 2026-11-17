export const metros = ['bay', 'austin'] as const
export type Metro = (typeof metros)[number]

export const homeMetro: Metro = 'bay'

export const metroInfo: Record<
  Metro,
  {
    path: string
    city: string
    area: string
    timeZone: string
    zone: string
    sun: { latitude: number; longitude: number }
  }
> = {
  bay: {
    path: '',
    city: 'San Francisco',
    area: 'Bay Area',
    timeZone: 'America/Los_Angeles',
    zone: 'PT',
    sun: { latitude: 37.7749, longitude: -122.4194 },
  },
  austin: {
    path: '/austin',
    city: 'Austin',
    area: 'Austin',
    timeZone: 'America/Chicago',
    zone: 'CT',
    sun: { latitude: 30.2672, longitude: -97.7431 },
  },
}

export const isMetro = (value: unknown): value is Metro => metros.includes(value as Metro)

export const metroAt = (pathname: string): Metro =>
  metros.find((metro) => {
    const { path } = metroInfo[metro]
    return path !== '' && (pathname === path || pathname.startsWith(`${path}/`))
  }) ?? homeMetro
