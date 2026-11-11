import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import cloudflare from "@astrojs/cloudflare";
import { printedTheme } from "./src/lib/printed-theme";

const nimbusConfig = defineNimbusConfig({
  site: "https://docs.oxabl.org",
  title: "oxabl",
  description:
    "How to install, run and configure oxabl, the toolchain for Progress ABL, and the oxabl cache.",
  locale: "en",
  github: "https://github.com/oxabl-project/oxabl",
  socialImageAlt: "oxabl documentation",
  agents: { mcp: true },
  sidebar: {
    // Each product is a section: its own sidebar and a header tab.
    scope: "section",
    items: [
      "index",
      { label: "Toolchain", autogenerate: { collection: "toolchain" } },
      { label: "Cache", autogenerate: { collection: "cache" } },
      { label: "Agents", link: "/agents/" },
    ],
  },
});

export default defineConfig({
  devToolbar: { enabled: false },
  // nimbus:adapter
  // Without a `rendering` policy every Nimbus route is built ahead of time;
  // the server output is only for the MCP server at /mcp.
  output: "server",
  // No sessions and images optimised at build time, so the Worker needs no KV
  // namespace and no Images binding.
  session: false,
  adapter: cloudflare({ prerenderEnvironment: "node", imageService: "compile" }),
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: { themes: { light: printedTheme, dark: printedTheme } },
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        // Wrap wide tables so they scroll instead of overflowing the page
        // (styled by `.nb-table-scroll` in src/styles/prose.css).
        hastPlugins: [tableScroll()],
        // `## Install {#install}` gives a heading a fixed id.
        features: { headingAttributes: true },
      },
    }),
  ],
});
