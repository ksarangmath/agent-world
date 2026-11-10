import type { WorldPerson } from '../../shared/api'
import { placesById } from '../../shared/map/places'

const doing: Record<string, string> = {
  'waterfront-market-hall': 'grazing the sample trays like it’s a sport',
  'pitch-stage': 'pitching to anyone who makes eye contact',
  'tower-lounge': 'swapping war stories over a very expensive water',
  'frontier-ai-lab': 'staring down a loss curve',
  'devtools-bar': 'arguing about tabs versus spaces, again',
  'soma-bouldering': 'stuck on the same V4 for twenty minutes',
  'rooftop-club': 'dancing like the DJ owes them money',
  'dogpatch-robotics': 'soldering something that will definitely work this time',
  'biotech-labs': 'pipetting with surgeon-steady hands',
  'valencia-coffee': 'nursing a flat white and a half-written doc',
  'mission-music-hall': 'nodding along to a band nobody’s heard of yet',
  'mural-alley': 'adding one more layer to the mural',
  'dolores-park': 'claiming the last sunny patch of grass',
  'late-night-taqueria': 'two tacos deep and considering a third',
  'rainbow-center': 'folding flyers and fixing the world',
  'haight-jam-space': 'jamming on a riff that almost works',
  'corner-bookshop': 'reading the first page of six books',
  'washington-square': 'losing a chess game with great dignity',
  'piano-bar': 'humming along to the piano, slightly off-key',
  'marina-green': 'running laps past the kite people',
  'lawn-bowls': 'rolling a bowl with suspicious precision',
  'ocean-beach-surf': 'shredding waves, or at least paddling at them',
  'dumpling-night-market': 'in line for the good dumplings',
  'lands-end-lookout': 'pretending not to be out of breath at the view',
  'stroller-playground': 'pushing a swing and comparing daycare waitlists',
  'waterfront-cafe': 'watching the boats over a cooling coffee',
  'houseboat-docks': 'tying a knot that will probably hold',
  'mountain-summit-trail': 'earning the view one switchback at a time',
  'university-library': 'deep in a book that’s due tomorrow',
  'oakland-music-hall': 'front row and feeling the bass',
  'lakeside-loop': 'jogging the lake and judging the ducks',
  vineyard: 'swirling a glass like they know what they’re doing',
  'research-campus': 'debating something loudly on the quad',
  'big-tech-campus': 'biking between buildings to one more meeting',
  'sand-hill-offices': 'pitching, or being pitched, hard to tell',
  'semiconductor-lab': 'squinting at a wafer under the microscope',
  arcade: 'chasing a high score set in 1994',
}

export function doingNow(person: WorldPerson, people: WorldPerson[]) {
  const place = placesById.get(person.placeId)
  if (person.trip) return `on the way to ${place?.name ?? 'somewhere'}`
  if (person.conversationId) {
    const partner = people.find(
      (other) => other.id !== person.id && other.conversationId === person.conversationId,
    )
    if (partner) return `deep in it with ${partner.name}`
  }
  return doing[person.placeId] ?? 'taking it all in'
}
