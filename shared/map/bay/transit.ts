import type { Transit } from '../route'

export const transit = {
  stations: {
    embarcadero: [-122.3968, 37.7929],
    westOakland: [-122.2951, 37.8048],
    fourthAndKing: [-122.3947, 37.7766],
    millbrae: [-122.3867, 37.6003],
    paloAlto: [-122.1649, 37.4434],
    mountainView: [-122.076, 37.3947],
    sanJose: [-121.9026, 37.3297],
    ferryBuilding: [-122.3937, 37.7955],
    sausalito: [-122.4778, 37.8568],
    jackLondon: [-122.2777, 37.795],
  },
  arrival: 'ferryBuilding',
  rides: [
    { name: 'Bay Rail', by: 'rail', from: 'embarcadero', to: 'westOakland' },
    { name: 'Peninsula Rail', by: 'rail', from: 'fourthAndKing', to: 'millbrae' },
    { name: 'Peninsula Rail', by: 'rail', from: 'millbrae', to: 'paloAlto' },
    { name: 'Peninsula Rail', by: 'rail', from: 'paloAlto', to: 'mountainView' },
    { name: 'Peninsula Rail', by: 'rail', from: 'mountainView', to: 'sanJose' },
    { name: 'Sausalito ferry', by: 'ferry', from: 'ferryBuilding', to: 'sausalito' },
    { name: 'Oakland ferry', by: 'ferry', from: 'ferryBuilding', to: 'jackLondon' },
  ],
} satisfies Transit
