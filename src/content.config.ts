import { defineCollection } from "astro:content";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";

// Nimbus docs are agent-friendly by default. Set `audience: human`
// to flag a page that's written primarily for human readers.
const schemaFields = { audience: z.literal("human").optional() };

export const collections = {
  docs: defineCollection(docsCollection({ schemaFields })),
  // One collection per product, each a section with its own sidebar and a
  // header tab.
  toolchain: defineCollection(docsCollection({ base: "toolchain", schemaFields })),
  cache: defineCollection(docsCollection({ base: "cache", schemaFields })),
  partials: defineCollection(partialsCollection()),
};
