import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import type { Store } from "solid-js/store"

type Tokens = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

type Message = {
  id: string
  type: string
  time?: { created: number; streamed?: number; completed?: number }
  tokens?: Tokens
  content?: Array<{ type: string; text?: string; time?: { created?: number } }>
}

type Metrics = {
  active: boolean
  ttft?: number
  tps?: number
  cacheHit?: number
}

type Live = {
  startedAt: number
  firstTokenAt?: number
  streamedAt?: number
  tokens: number
  messageID?: string
}

type ViewState = { open: boolean }

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g

function estimate(text: string): number {
  if (!text) return 0
  const cjk = (text.match(CJK) ?? []).length
  return Math.ceil(cjk + (text.length - cjk) / 4)
}

function hitRate(tokens?: Tokens): number | undefined {
  if (!tokens) return undefined
  const prompt = tokens.input + tokens.cache.read + tokens.cache.write
  if (prompt <= 0) return 0
  return (tokens.cache.read / prompt) * 100
}

function exactTps(message?: Message): number | undefined {
  if (!message?.tokens || message.time?.streamed === undefined) return undefined
  const seconds = (message.time.streamed - message.time.created) / 1000
  const output = message.tokens.output + message.tokens.reasoning
  if (seconds <= 0 || output <= 0) return undefined
  return output / seconds
}

function ttftFromMessage(message?: Message): number | undefined {
  if (!message?.time) return undefined
  const first = message.content?.find((part) => part.type === "reasoning" && part.time?.created)?.time?.created
  if (first === undefined) return undefined
  return Math.max(0, first - message.time.created)
}

function lastAssistant(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.type === "assistant" && message.tokens) return message
  }
  return undefined
}

function maxNumber(left?: number, right?: number): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

function minNumber(left?: number, right?: number): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left, right)
}

type Summary = {
  turn: number
  total: number
  maxCacheHit?: number
  minTtft?: number
  turnTps?: number
  turnStart?: number
  turnEnd?: number
  baseRuntime: number
}

function summarize(messages: Message[]): Summary {
  let total = 0
  const users: number[] = []
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].type === "user") users.push(index)
    if (messages[index].type === "assistant") total += 1
  }
  const lastUser = users.at(-1) ?? -1
  const turn = lastUser < 0 ? 0 : messages.slice(lastUser + 1).filter((message) => message.type === "assistant").length
  let maxCacheHit: number | undefined
  let minTtft: number | undefined
  for (const message of messages) {
    if (message.type !== "assistant") continue
    maxCacheHit = maxNumber(maxCacheHit, hitRate(message.tokens))
    minTtft = minNumber(minTtft, ttftFromMessage(message))
  }
  let output = 0
  let duration = 0
  if (lastUser >= 0) {
    for (let index = lastUser + 1; index < messages.length; index++) {
      const message = messages[index]
      if (message.type !== "assistant" || !message.tokens || message.time?.streamed === undefined) continue
      output += message.tokens.output + message.tokens.reasoning
      duration += Math.max(0, message.time.streamed - message.time.created)
    }
  }
  const turnTps = output > 0 && duration > 0 ? output / (duration / 1000) : undefined
  let baseRuntime = 0
  let turnStart: number | undefined
  let turnEnd: number | undefined
  for (let index = 0; index < users.length; index++) {
    const start = messages[users[index]].time?.created
    if (start === undefined) continue
    const next = index + 1 < users.length ? users[index + 1] : messages.length
    let end: number | undefined
    for (let inner = users[index] + 1; inner < next; inner++) {
      const message = messages[inner]
      if (message.type !== "assistant" || !message.time) continue
      end = message.time.completed ?? message.time.streamed ?? message.time.created
    }
    if (index === users.length - 1) {
      turnStart = start
      turnEnd = end
    } else if (end !== undefined) {
      baseRuntime += Math.max(0, end - start)
    }
  }
  return { turn, total, maxCacheHit, minTtft, turnTps, turnStart, turnEnd, baseRuntime }
}

function ttftValue(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—"
  return (value / 1000).toFixed(3)
}

function pctValue(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—"
  return value.toFixed(3)
}

function tpsValue(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—"
  return value.toFixed(1)
}

function durationValue(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "—"
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${Math.floor(seconds % 60)}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${minutes % 60}m`
}

const VALUE_WIDTH = 7

type Level = "good" | "fair" | "bad" | "none"

// Thresholds are based on common chat latency/throughput guidance: TTFT under
// 1s feels instant, 1-3s is usable, above 3s feels slow. 50 TPS is fluent,
// 20 TPS is the practical lower bound for chat. A prompt cache hit above 80%
// is healthy; 50-80% leaves room; below 50% means the prefix is churning.
function cacheLevel(value?: number): Level {
  if (value === undefined || !Number.isFinite(value)) return "none"
  if (value >= 80) return "good"
  if (value >= 50) return "fair"
  return "bad"
}

function ttftLevel(value?: number): Level {
  if (value === undefined || !Number.isFinite(value)) return "none"
  if (value <= 1000) return "good"
  if (value <= 3000) return "fair"
  return "bad"
}

function tpsLevel(value?: number): Level {
  if (value === undefined || !Number.isFinite(value)) return "none"
  if (value >= 50) return "good"
  if (value >= 20) return "fair"
  return "bad"
}

function levelColor(theme: Context["theme"], level: Level): string {
  if (level === "good") return theme.text.feedback.success.base
  if (level === "fair") return theme.text.feedback.warning.base
  if (level === "bad") return theme.text.feedback.error.base
  return theme.text.muted
}

function MetricRow(props: {
  theme: Context["theme"]
  width: number
  label: string
  unit?: string
  value: string
  max?: string
  level: Level
}) {
  const labelWidth = Math.max(8, props.width - VALUE_WIDTH * 2 - 2)
  return (
    <box flexDirection="row" width="100%">
      <text flexShrink={0} fg={levelColor(props.theme, props.level)}>{"• "}</text>
      <box flexDirection="row" width={labelWidth} flexShrink={0}>
        <text fg={props.theme.text.base}>{props.label}</text>
        {props.unit ? (
          <text fg={props.theme.text.muted}>{` (${props.unit})`}</text>
        ) : null}
      </box>
      <text flexShrink={0} fg={props.theme.text.base}>{props.value.padStart(VALUE_WIDTH)}</text>
      {props.max !== undefined ? (
        <text flexShrink={0} fg={props.theme.text.muted}>{props.max.padStart(VALUE_WIDTH)}</text>
      ) : null}
    </box>
  )
}

function Panel(props: {
  ctx: Context
  sessionID: string
  metrics: Store<Record<string, Metrics>>
  summary: Store<Record<string, Summary>>
  ensureSummary: (sessionID: string, force?: boolean) => void
  clock: Store<{ now: number }>
  view: Store<ViewState>
  setView: (mutation: (draft: ViewState) => void) => Promise<void>
  ui: Store<{ width: number }>
  setUI: (mutation: (draft: { width: number }) => void) => void
}) {
  props.ensureSummary(props.sessionID)
  const theme = props.ctx.theme
  const messages = () =>
    (props.ctx.data.session.message.list(props.sessionID) as unknown as Message[]) ?? []
  const current = () => props.metrics[props.sessionID]
  const summary = () => props.summary[props.sessionID]
  const last = () => lastAssistant(messages())
  const open = () => props.view.open

  const fallbackTurn = () => {
    const list = messages()
    let lastUser = -1
    for (let index = list.length - 1; index >= 0; index--) {
      if (list[index].type === "user") {
        lastUser = index
        break
      }
    }
    return list.slice(lastUser + 1).filter((message) => message.type === "assistant").length
  }
  const requestsThisMessage = () => summary()?.turn ?? fallbackTurn()
  const requestsSession = () => summary()?.total ?? messages().filter((message) => message.type === "assistant").length
  const cacheHit = () => current()?.cacheHit ?? hitRate(last()?.tokens)
  const ttft = () => current()?.ttft ?? ttftFromMessage(last())
  const tps = () => current()?.tps ?? exactTps(last())
  const maxCacheHit = () => summary()?.maxCacheHit ?? cacheHit()
  const turnTps = () => summary()?.turnTps ?? tps()
  const sessionMinTtft = () => summary()?.minTtft ?? ttft()
  const running = () => props.ctx.data.session.status(props.sessionID) === "running"
  const turnStart = () => {
    const list = messages()
    for (let index = list.length - 1; index >= 0; index--) {
      const message = list[index]
      if (message.type === "user" && message.time?.created) return message.time.created
    }
    return summary()?.turnStart
  }
  const turnMs = () => {
    const start = turnStart()
    if (!start) return 0
    const data = summary()
    const end = running()
      ? Math.max(props.clock.now, start)
      : data?.turnEnd !== undefined && data.turnEnd > start
        ? data.turnEnd
        : start
    return Math.max(0, end - start)
  }
  const totals = new Map<string, number>()
  const sessionMs = () => {
    const value = (summary()?.baseRuntime ?? 0) + turnMs()
    const previous = totals.get(props.sessionID) ?? 0
    const next = Math.max(previous, value)
    totals.set(props.sessionID, next)
    return next
  }

  const toggle = () => {
    void props.setView((draft) => {
      draft.open = !draft.open
    }).catch(() => {})
  }

  return (
    <box
      flexDirection="column"
      width="100%"
      ref={((element: any) => {
        if (!element) return
        const update = () => {
          const next = (element.width ?? 0) | 0
          if (!next) return
          props.setUI((draft) => {
            if (draft.width !== next) draft.width = next
          })
        }
        element.onSizeChange = update
        queueMicrotask(update)
      }) as any}
    >
      <box flexDirection="row" gap={1} onMouseDown={toggle}>
        <text fg={theme.text.base}>{open() ? "▼" : "▶"}</text>
        <text fg={theme.text.base}>
          <b>Metrics</b>
        </text>
      </box>

      {!open() ? null : (
        <>
          <MetricRow theme={theme} width={props.ui.width} label="Time" value={durationValue(turnMs())} max={durationValue(sessionMs())} level="good" />
          <MetricRow theme={theme} width={props.ui.width} label="Requests" value={String(requestsThisMessage())} max={String(requestsSession())} level="good" />
          <MetricRow theme={theme} width={props.ui.width} label="Cache hit" unit="%" value={pctValue(cacheHit())} max={pctValue(maxCacheHit())} level={cacheLevel(cacheHit())} />
          <MetricRow theme={theme} width={props.ui.width} label="TTFT" unit="s" value={ttftValue(ttft())} max={ttftValue(sessionMinTtft())} level={ttftLevel(ttft())} />
          <MetricRow theme={theme} width={props.ui.width} label="TPS" unit="tok/s" value={tpsValue(tps())} max={tpsValue(turnTps())} level={tpsLevel(tps())} />
        </>
      )}
    </box>
  )
}

export default Plugin.define({
  id: "live.metrics.sidebar",
  setup(ctx: Context) {
    const [metrics, setMetrics] = ctx.storage.memory<Record<string, Metrics>>("metrics", { initial: {} })
    const [summary, setSummary] = ctx.storage.memory<Record<string, Summary>>("summary", { initial: {} })
    const summaryAt = new Map<string, number>()
    const summaryLoading = new Set<string>()
    const ensureSummary = (sessionID: string, force = false) => {
      if (!sessionID || summaryLoading.has(sessionID)) return
      if (!force && Date.now() - (summaryAt.get(sessionID) ?? 0) < 3000) return
      summaryAt.set(sessionID, Date.now())
      summaryLoading.add(sessionID)
      void ctx.client.session
        .context({ sessionID })
        .then((messages) => {
          setSummary((draft) => {
            draft[sessionID] = summarize(messages as unknown as Message[])
          })
        })
        .catch(() => {})
        .finally(() => summaryLoading.delete(sessionID))
    }
    const [view, setView] = ctx.storage.store<ViewState>("view", { initial: { open: true } })
    const [ui, setUI] = ctx.storage.memory<{ width: number }>("ui", { initial: { width: 34 } })
    const [clock, setClock] = ctx.storage.memory<{ now: number }>("clock", { initial: { now: Date.now() } })
    const live = new Map<string, Live>()
    const clockTimer = setInterval(() => {
      setClock((draft) => {
        draft.now = Date.now()
      })
    }, 100)

    const set = (sessionID: string, patch: Partial<Metrics>) => {
      setMetrics((draft) => {
        draft[sessionID] = { ...(draft[sessionID] ?? { active: false }), ...patch }
      })
    }

    const finish = (sessionID: string) => {
      const item = live.get(sessionID)
      const message = lastAssistant(ctx.data.session.message.list(sessionID) as unknown as Message[])
      live.delete(sessionID)
      set(sessionID, {
        active: false,
        cacheHit: item ? metrics[sessionID]?.cacheHit : hitRate(message?.tokens),
        tps: metrics[sessionID]?.tps ?? exactTps(message),
      })
    }

    const stop = ctx.data.listen(({ details }) => {
      const event = details as any
      const data = event.data ?? {}
      switch (event.type) {
        case "session.step.started":
          ensureSummary(data.sessionID, true)
          live.set(data.sessionID, {
            startedAt: data.started > 0 ? data.started : Date.now(),
            tokens: 0,
            messageID: data.assistantMessageID,
          })
          set(data.sessionID, { active: true, ttft: undefined, tps: undefined })
          break
        case "session.step.streamed": {
          const item = live.get(data.sessionID)
          if (item) item.streamedAt = Date.now()
          break
        }
        case "session.message.content.updated": {
          const item = live.get(data.sessionID)
          if (!item) break
          if (item.messageID && data.messageID !== item.messageID) break
          if (!item.firstTokenAt) {
            item.firstTokenAt = Date.now()
            set(data.sessionID, {
              active: true,
              ttft: Math.max(0, item.firstTokenAt - item.startedAt),
            })
          }
          let tokens = 0
          for (const part of data.content as Array<{ type: string; text?: string }>) {
            if ((part.type === "text" || part.type === "reasoning") && part.text) {
              tokens += estimate(part.text)
            }
          }
          item.tokens = tokens
          break
        }
        case "session.step.ended": {
          const item = live.get(data.sessionID)
          const tokens = data.tokens as Tokens
          const start = item?.startedAt ?? Date.now()
          const end = item?.streamedAt ?? Date.now()
          const seconds = (end - start) / 1000
          const output = tokens.output + tokens.reasoning
          set(data.sessionID, {
            active: false,
            cacheHit: hitRate(tokens),
            tps: seconds > 0 && output > 0 ? output / seconds : undefined,
          })
          live.delete(data.sessionID)
          ensureSummary(data.sessionID, true)
          break
        }
        case "session.execution.succeeded":
        case "session.execution.failed":
        case "session.execution.interrupted":
        case "session.idle":
          if (data.sessionID) {
            ensureSummary(data.sessionID, true)
            finish(data.sessionID)
          }
          break
      }
    })

    const timer = setInterval(() => {
      if (live.size === 0) return
      const now = Date.now()
      setMetrics((draft) => {
        for (const [sessionID, item] of live) {
          if (!item.firstTokenAt || item.tokens <= 0) continue
          const seconds = (now - item.firstTokenAt) / 1000
          if (seconds <= 0) continue
          const previous = draft[sessionID] ?? { active: true }
          const tps = item.tokens / seconds
          draft[sessionID] = {
            ...previous,
            active: true,
            tps,
          }
        }
      })
    }, 500)

    const dispose = ctx.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => (
        <Panel
          ctx={ctx}
          sessionID={sessionID}
          metrics={metrics}
          summary={summary}
          ensureSummary={ensureSummary}
          clock={clock}
          view={view}
          setView={setView}
          ui={ui}
          setUI={setUI}
        />
      ),
    })

    return () => {
      clearInterval(timer)
      clearInterval(clockTimer)
      stop()
      dispose()
    }
  },
})
