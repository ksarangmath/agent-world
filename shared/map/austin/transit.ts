import type { Transit } from '../route'

export const transit = {
  stations: {
    downtown: [-97.7384, 30.2647],
    highland: [-97.7162, 30.3286],
    kramer: [-97.7164, 30.3928],
    lakeline: [-97.7866, 30.481],
  },
  arrival: 'downtown',
  rides: [
    { name: 'Capital Rail', by: 'rail', from: 'downtown', to: 'highland' },
    { name: 'Capital Rail', by: 'rail', from: 'highland', to: 'kramer' },
    { name: 'Capital Rail', by: 'rail', from: 'kramer', to: 'lakeline' },
  ],
} satisfies Transit
