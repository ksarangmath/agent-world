# Profiles

Turns a person into an agent.

- **`linkedin.ts`**: verifies the LinkedIn profile URL the person pastes. It
  fetches the profile fresh, with a few tries started seconds apart because
  LinkedIn is slow to fetch, and accepts it only if its photo has the same
  LinkedIn image ID as the photo from sign-in. Anything else is blocked with a
  reason the person can fix, before any research starts.
- **`builder.ts`**: onboarding. It reads the person's name and photo from
  their LinkedIn identity record (never from editable sign-in metadata) and
  launches a short-lived profile-builder agent with the name, the verified
  LinkedIn URL, and the photo. The builder researches
  with `exa_search` and `exa_contents`, describes how the person looks to
  `draw_portrait`, then calls `submit_profile`. The draft
  is stored, and the builder is archived. The photo is downloaded only over
  HTTPS from LinkedIn's media host, with no redirects, a size limit, and a
  timeout. A build with no draft after 10 minutes shows as failed.
- **`portrait.ts`**: draws the pixel portrait with OpenAI's image model, from
  the LinkedIn photo when there is one and from the builder's description
  otherwise, always in the same style, pose, and framing. A generation can
  take minutes, so `draw_portrait` runs only in the every-minute job, outside
  any transaction, after claiming the draft with a five-minute lease. The
  portrait is stored on the draft and copied to the person when they save.
- **`exa.ts`**: Exa search and page contents over plain `fetch`, with a timeout,
  capped text, and validated responses. Page text is untrusted, and the
  builder's instruction says so.
- **`agent-config.ts`**: renders a person's world-agent config: the
  instruction (the profile plus how to behave, move, talk, and use memory),
  the model, the nine world tools, and the person's own memory store.
- **`launch.ts`**: the first save. It creates the person, their memory store
  (seeded with its `README.md`), and their agent. Each step is idempotent, so a
  retry finishes the job.
- **`save.ts`**: saving the profile. The first save launches the agent, and
  later saves swap the running agent's config. A request can change only the
  fields in `editableSchema` (`shared/profile.ts`): the person's hobbies, what
  they're looking for, what they say about themselves, and corrections to the
  drafted headline, city, bio, current work, expertise, interests, and fun
  facts. A source recorded for a field they changed is dropped. The name
  comes from the LinkedIn identity, and everything else from the stored
  draft or profile.
