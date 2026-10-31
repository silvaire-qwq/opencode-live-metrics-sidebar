# Live metrics sidebar

A local OpenCode V2 TUI plugin that shows request and streaming metrics in the
session sidebar.

## What it shows

| Row | Left | Right |
| --- | --- | --- |
| Requests | Requests for the current user message | Requests in the whole session |
| Cache hit | Current request hit rate | Session maximum |
| TTFT | Current time to first token | Session minimum |
| TPS | Current output speed | Session maximum |

Each row starts with a status dot:

| Metric | Green | Yellow | Red |
| --- | --- | --- | --- |
| Cache hit | `>= 80%` | `50-80%` | `< 50%` |
| TTFT | `<= 1s` | `1-3s` | `> 3s` |
| TPS | `>= 50 tok/s` | `20-50` | `< 20` |
| Requests | always | | |

Click the `Metrics` header to collapse the panel.

## Update behavior

- Requests, session counts, and session max/min come from the full session
  context API, not from the TUI's loaded message window, so every window shows
  the same session totals.
- TTFT is captured when the first content event arrives.
- TPS updates every 500 ms while a response streams, then uses the exact token
  and stream timings when the step ends.
- Cache hit uses the provider's token counts from the completed request.

Live TPS before the step ends is estimated from the streamed text, so it can
move slightly when the final token counts arrive. The session max/min values use
completed requests.

## Install

The package is TUI-only, so load it from `cli.json`:

```json
{
  "plugins": ["/absolute/path/to/live-metrics-sidebar"]
}
```

Reload or restart the TUI if the panel does not appear.

## Development

```sh
npm install
npm run typecheck
npm run build
```

`npm run build` compiles `src/tui.tsx` into `dist/tui.js`. OpenCode provides
`@opencode/*` and `@opentui/*` at runtime.
