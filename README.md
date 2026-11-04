# oxabl-docs

User documentation for [oxabl](https://github.com/oxabl-project/oxabl), the toolchain for
Progress ABL, and for [oxabl-cache](https://github.com/oxabl-project/oxabl-cache), its
remote compile cache. Built with [Nimbus](https://nimbus-docs.com/) and styled to match
[oxabl.org](https://oxabl.org).

This is an early prototype. It is not deployed yet, and only some of the pages are
written.

## Run it

```bash
npm ci
npm run dev       # http://localhost:4321
npm run build     # static build in dist/
npm run lint:docs
```

The pages are in `src/content/docs/`. `demo/` holds the sample projects that the
transcripts on the pages were recorded from.

## Licence

MIT. See [LICENSE](LICENSE).
