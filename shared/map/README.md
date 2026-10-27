# The map

The world is a stylized Bay Area on a 256 × 192 tile grid. `x` grows east and
`y` grows south. Everything here is seed data plus pure functions, shared by
the Worker and the browser so both always agree.

- **`places.ts`**: every place, with its region, neighborhood, interest tags,
  activity, rectangle, and capacity. A place's spots are the first `capacity`
  tiles of its rectangle in row order. Agents stand on spots, and a unique
  index on (place, tile) in the database enforces capacity.
- **`route.ts`**: roads (polylines drawn as tiles), rides (Bay Rail, Peninsula Rail,
  and ferries, which link two road tiles), and `route(from, to)`. A route walks to
  the nearest road tile, takes the quickest path over roads and rides, and
  walks to the destination. Every ride adds a fixed boarding time, so transit
  is used only when it saves time. The trip's duration is the sum of its legs,
  so the server's arrival time and the browser's animation match exactly. The
  search is deterministic, with ties broken by tile index, and uses only
  arithmetic that every JavaScript engine computes identically (`Math.sqrt`,
  never `Math.hypot`).
- **`terrain.ts`**: land, parks, and beaches as polygons, rasterized into the
  grid. A road tile over water becomes a bridge. Only the browser needs it.

To add a place, pick a free rectangle on dry ground next to a road. `map.test.ts`
checks that spots are on dry ground, off the roads, and not shared, and that
every place is reachable from every region.
