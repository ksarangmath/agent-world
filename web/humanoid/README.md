# The humanoid

Everyone in the world is the same figure, dressed and shaped by their
`avatar` presets (see `shared/profile.ts`).

- **`shapes.ts`**: builds the geometry. The head is a sphere sculpted per face
  shape; eyes, brows, nose, lips, and blush are placed on its surface; hair and
  beards are shells of the same head, cut along a hairline and swollen by
  style. The torso, hips, and limbs are lathed profiles scaled by build, and
  clothing details are patches laid on the chest. Each shape is built the first
  time an id like `hair:oval:bob` is asked for, then cached.
- **`model.ts`**: turns an avatar into a list of parts (a shape id, a color,
  and the body segment it rides on), holds the poses for walking, talking, and
  each place's activity, and `articulate` turns a body matrix and a pose into
  one matrix per segment (shoulders, elbows, hips, knees).
- **`Figures.tsx`**: draws any number of figures with one instanced mesh per
  shape in use, for the map's `People`.
