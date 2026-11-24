# oxabl-docs

User documentation for [oxabl](https://github.com/oxabl-project/oxabl), the toolchain for
Progress ABL, and for [oxabl-cache](https://github.com/oxabl-project/oxabl-cache), its
remote compile cache. Built with [Nimbus](https://nimbus-docs.com/) and styled to match
[oxabl.org](https://oxabl.org).

This is an early version: only some of the pages are written. It is deployed at
[docs.oxabl.org](https://docs.oxabl.org).

## Run it

```bash
npm ci
npm run dev       # http://localhost:4321
npm run build     # static build in dist/
npm run lint:docs
npm run skill:test   # the skill sync script
npm run skill:check  # offline: is the vendored skill consistent with the pages?
npm run skill:check:release  # is it the latest oxabl release's? (network)
```

The pages are in `src/content/docs/`. `demo/` holds the sample projects that the
transcripts on the pages were recorded from.

## Deploy

Every push to `main` deploys (`.github/workflows/deploy.yml`); a pull request only
checks and builds. The site is the Cloudflare Worker `oxabl-docs`: it serves the
pre-built pages as static assets and runs only for the MCP server at `/mcp`. By
hand: `npm run deploy`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set.

## Licence

MIT. See [LICENSE](LICENSE).

## Skill sync

`.github/workflows/sync-skill.yml` syncs `src/skill/oxabl` to the latest oxabl release every day and opens or updates a PR on `bot/sync-skill`. PRs opened with `GITHUB_TOKEN` do not trigger CI, so a person re-runs the checks or pushes to the branch before merging.
