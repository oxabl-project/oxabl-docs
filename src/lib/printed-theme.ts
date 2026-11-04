// oxabl.org's printed syntax palette (DESIGN.md, "Syntax theme"): indigo for
// structure, plain ink for identifiers, no red. The colours are the site's CSS
// variables, so one theme serves light and dark paper.
export const printedTheme = {
  name: "oxabl-printed",
  type: "light" as const,
  colors: {
    "editor.background": "var(--paper)",
    "editor.foreground": "var(--ink)",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "var(--syn-comment-print)" },
    },
    {
      scope: ["keyword", "storage", "entity.name.tag", "support.type.property-name", "entity.name.function", "support.function"],
      settings: { foreground: "var(--syn-keyword-print)" },
    },
    {
      scope: ["string", "constant", "constant.numeric", "constant.language", "markup.inline.raw"],
      settings: { foreground: "var(--syn-literal-print)" },
    },
  ],
};
