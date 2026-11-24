import type { APIRoute, GetStaticPaths } from "astro";

export const prerender = true;

// The vendored copy of the oxabl agent skill, served as Markdown at
// /skill/SKILL.md and /skill/references/<file>.md. scripts/sync-skill.mjs
// fills src/skill/oxabl.
const files = import.meta.glob<string>("/src/skill/oxabl/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const root = "/src/skill/oxabl/";

export const getStaticPaths = (() => {
  if (!(`${root}SKILL.md` in files)) {
    throw new Error("src/skill/oxabl/SKILL.md is missing; run scripts/sync-skill.mjs");
  }
  return Object.entries(files).map(([path, body]) => ({
    params: { file: path.slice(root.length) },
    props: { body },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
