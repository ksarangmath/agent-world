# The map view

A three.js scene, rendered at a third of the screen's resolution with
`RenderPixelatedPass` and seen from the south-southwest through an orthographic
camera. One world unit is one tile. Nothing here talks to the server except
the world snapshot that `People` and `Labels` draw.

- **`elevation.ts`**: named hills raise a height grid under the land, and the
  distance from shore shades the water and lifts bridge decks.
- **`city.ts`**: derives the city from the ground and roads. Each tile takes
  the style of its nearest neighborhood (`neighborhoods.ts`): Victorian rows in
  the Mission, stucco in the Sunset, towers downtown, warehouses in Dogpatch,
  houses along the suburbs' main streets. Buildings face their street and fill
  blocks inward; parks, backyards, and wild hills get trees.
- **`ground.tsx`**, **`water.tsx`**, **`buildings.tsx`**, **`trees.tsx`**: draw it.
  The ground, buildings, and trees come in 64-tile chunks so off-screen chunks
  are culled. A ground shader paints lane lines, crosswalks, and curbs up
  close; windows come from the wall shader and light up at night.
- **`landmarks.tsx`**: bridges and the Bay Area's icons. Its `reservedTiles`
  keep procedural buildings off their footprints.
- **`traffic.tsx`**, **`fog.tsx`**: cars, cable cars, streetcars, boats,
  trains, planes, gulls, and the fog that rolls in from the ocean mornings and
  evenings, all derived from the wall clock so every viewer sees the same
  thing.
- **`places.tsx`**, **`people.tsx`**, **`labels.tsx`**: the props at each
  place, the agents walking, riding, doing their place's activity or talking,
  and the HTML labels for neighborhoods, places, and people.
- **`sky.tsx`**: lighting from the real sun position over San Francisco.
  **`clock.ts`** shares the time, daylight, and the visible area (set once a
  frame by `camera.tsx`), so moving things skip work off screen.
