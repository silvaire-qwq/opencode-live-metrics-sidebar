import { createComponent as _$createComponent } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g;
function estimate(text) {
  if (!text) return 0;
  const cjk = (text.match(CJK) ?? []).length;
  return Math.ceil(cjk + (text.length - cjk) / 4);
}
function hitRate(tokens) {
  if (!tokens) return undefined;
  const prompt = tokens.input + tokens.cache.read + tokens.cache.write;
  if (prompt <= 0) return 0;
  return tokens.cache.read / prompt * 100;
}
function exactTps(message) {
  if (!message?.tokens || message.time?.streamed === undefined) return undefined;
  const seconds = (message.time.streamed - message.time.created) / 1000;
  const output = message.tokens.output + message.tokens.reasoning;
  if (seconds <= 0 || output <= 0) return undefined;
  return output / seconds;
}
function ttftFromMessage(message) {
  if (!message?.time) return undefined;
  const first = message.content?.find(part => part.type === "reasoning" && part.time?.created)?.time?.created;
  if (first === undefined) return undefined;
  return Math.max(0, first - message.time.created);
}
function lastAssistant(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type === "assistant" && message.tokens) return message;
  }
  return undefined;
}
function maxNumber(left, right) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}
function minNumber(left, right) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}
function summarize(messages) {
  let total = 0;
  let lastUser = -1;
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].type === "user") lastUser = index;
    if (messages[index].type === "assistant") total += 1;
  }
  const turn = lastUser < 0 ? 0 : messages.slice(lastUser + 1).filter(message => message.type === "assistant").length;
  let maxCacheHit;
  let maxTps;
  let minTtft;
  for (const message of messages) {
    if (message.type !== "assistant") continue;
    maxCacheHit = maxNumber(maxCacheHit, hitRate(message.tokens));
    maxTps = maxNumber(maxTps, exactTps(message));
    minTtft = minNumber(minTtft, ttftFromMessage(message));
  }
  return {
    turn,
    total,
    maxCacheHit,
    maxTps,
    minTtft
  };
}
function ttftValue(value) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return (value / 1000).toFixed(3);
}
function pctValue(value) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}
function tpsValue(value) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
const VALUE_WIDTH = 7;
// Thresholds are based on common chat latency/throughput guidance: TTFT under
// 1s feels instant, 1-3s is usable, above 3s feels slow. 50 TPS is fluent,
// 20 TPS is the practical lower bound for chat. A prompt cache hit above 80%
// is healthy; 50-80% leaves room; below 50% means the prefix is churning.
function cacheLevel(value) {
  if (value === undefined || !Number.isFinite(value)) return "none";
  if (value >= 80) return "good";
  if (value >= 50) return "fair";
  return "bad";
}
function ttftLevel(value) {
  if (value === undefined || !Number.isFinite(value)) return "none";
  if (value <= 1000) return "good";
  if (value <= 3000) return "fair";
  return "bad";
}
function tpsLevel(value) {
  if (value === undefined || !Number.isFinite(value)) return "none";
  if (value >= 50) return "good";
  if (value >= 20) return "fair";
  return "bad";
}
function levelColor(theme, level) {
  if (level === "good") return theme.text.feedback.success.base;
  if (level === "fair") return theme.text.feedback.warning.base;
  if (level === "bad") return theme.text.feedback.error.base;
  return theme.text.muted;
}
function MetricRow(props) {
  const labelWidth = Math.max(8, props.width - VALUE_WIDTH * 2 - 2);
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("text"),
      _el$4 = _$createElement("box"),
      _el$5 = _$createElement("text"),
      _el$6 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$4);
    _$insertNode(_el$, _el$6);
    _$setProp(_el$, "flexDirection", "row");
    _$setProp(_el$, "width", "100%");
    _$insertNode(_el$2, _$createTextNode(`• `));
    _$setProp(_el$2, "flexShrink", 0);
    _$insertNode(_el$4, _el$5);
    _$setProp(_el$4, "flexDirection", "row");
    _$setProp(_el$4, "width", labelWidth);
    _$setProp(_el$4, "flexShrink", 0);
    _$insert(_el$5, () => props.label);
    _$insert(_el$4, (() => {
      var _c$ = _$memo(() => !!props.unit);
      return () => _c$() ? (() => {
        var _el$7 = _$createElement("text");
        _$insert(_el$7, () => ` (${props.unit})`);
        _$effect(_$p => _$setProp(_el$7, "fg", props.theme.text.muted, _$p));
        return _el$7;
      })() : null;
    })(), null);
    _$setProp(_el$6, "flexShrink", 0);
    _$insert(_el$6, () => props.value.padStart(VALUE_WIDTH));
    _$insert(_el$, (() => {
      var _c$2 = _$memo(() => props.max !== undefined);
      return () => _c$2() ? (() => {
        var _el$8 = _$createElement("text");
        _$setProp(_el$8, "flexShrink", 0);
        _$insert(_el$8, () => props.max.padStart(VALUE_WIDTH));
        _$effect(_$p => _$setProp(_el$8, "fg", props.theme.text.muted, _$p));
        return _el$8;
      })() : null;
    })(), null);
    _$effect(_p$ => {
      var _v$ = levelColor(props.theme, props.level),
        _v$2 = props.theme.text.base,
        _v$3 = props.theme.text.base;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$6, "fg", _v$3, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
}
function Panel(props) {
  props.ensureSummary(props.sessionID);
  const theme = props.ctx.theme;
  const messages = () => props.ctx.data.session.message.list(props.sessionID) ?? [];
  const current = () => props.metrics[props.sessionID];
  const summary = () => props.summary[props.sessionID];
  const last = () => lastAssistant(messages());
  const open = () => props.view.open;
  const fallbackTurn = () => {
    const list = messages();
    let lastUser = -1;
    for (let index = list.length - 1; index >= 0; index--) {
      if (list[index].type === "user") {
        lastUser = index;
        break;
      }
    }
    return list.slice(lastUser + 1).filter(message => message.type === "assistant").length;
  };
  const requestsThisMessage = () => summary()?.turn ?? fallbackTurn();
  const requestsSession = () => summary()?.total ?? messages().filter(message => message.type === "assistant").length;
  const cacheHit = () => current()?.cacheHit ?? hitRate(last()?.tokens);
  const ttft = () => current()?.ttft ?? ttftFromMessage(last());
  const tps = () => current()?.tps ?? exactTps(last());
  const maxCacheHit = () => summary()?.maxCacheHit ?? cacheHit();
  const maxTps = () => summary()?.maxTps ?? tps();
  const sessionMinTtft = () => summary()?.minTtft ?? ttft();
  const toggle = () => {
    void props.setView(draft => {
      draft.open = !draft.open;
    }).catch(() => {});
  };
  return (() => {
    var _el$9 = _$createElement("box"),
      _el$0 = _$createElement("box"),
      _el$1 = _$createElement("text"),
      _el$10 = _$createElement("text"),
      _el$11 = _$createElement("b");
    _$insertNode(_el$9, _el$0);
    _$use(element => {
      if (!element) return;
      const update = () => {
        const next = (element.width ?? 0) | 0;
        if (!next) return;
        props.setUI(draft => {
          if (draft.width !== next) draft.width = next;
        });
      };
      element.onSizeChange = update;
      queueMicrotask(update);
    }, _el$9);
    _$setProp(_el$9, "flexDirection", "column");
    _$setProp(_el$9, "width", "100%");
    _$insertNode(_el$0, _el$1);
    _$insertNode(_el$0, _el$10);
    _$setProp(_el$0, "flexDirection", "row");
    _$setProp(_el$0, "gap", 1);
    _$setProp(_el$0, "onMouseDown", toggle);
    _$insert(_el$1, () => open() ? "▼" : "▶");
    _$insertNode(_el$10, _el$11);
    _$insertNode(_el$11, _$createTextNode(`Metrics`));
    _$insert(_el$9, (() => {
      var _c$3 = _$memo(() => !!!open());
      return () => _c$3() ? null : [_$createComponent(MetricRow, {
        theme: theme,
        get width() {
          return props.ui.width;
        },
        label: "Requests",
        get value() {
          return String(requestsThisMessage());
        },
        get max() {
          return String(requestsSession());
        },
        level: "good"
      }), _$createComponent(MetricRow, {
        theme: theme,
        get width() {
          return props.ui.width;
        },
        label: "Cache hit",
        unit: "%",
        get value() {
          return pctValue(cacheHit());
        },
        get max() {
          return pctValue(maxCacheHit());
        },
        get level() {
          return cacheLevel(cacheHit());
        }
      }), _$createComponent(MetricRow, {
        theme: theme,
        get width() {
          return props.ui.width;
        },
        label: "TTFT",
        unit: "s",
        get value() {
          return ttftValue(ttft());
        },
        get max() {
          return ttftValue(sessionMinTtft());
        },
        get level() {
          return ttftLevel(ttft());
        }
      }), _$createComponent(MetricRow, {
        theme: theme,
        get width() {
          return props.ui.width;
        },
        label: "TPS",
        unit: "tok/s",
        get value() {
          return tpsValue(tps());
        },
        get max() {
          return tpsValue(maxTps());
        },
        get level() {
          return tpsLevel(tps());
        }
      })];
    })(), null);
    _$effect(_p$ => {
      var _v$4 = theme.text.base,
        _v$5 = theme.text.base;
      _v$4 !== _p$.e && (_p$.e = _$setProp(_el$1, "fg", _v$4, _p$.e));
      _v$5 !== _p$.t && (_p$.t = _$setProp(_el$10, "fg", _v$5, _p$.t));
      return _p$;
    }, {
      e: undefined,
      t: undefined
    });
    return _el$9;
  })();
}
export default Plugin.define({
  id: "live.metrics.sidebar",
  setup(ctx) {
    const [metrics, setMetrics] = ctx.storage.memory("metrics", {
      initial: {}
    });
    const [summary, setSummary] = ctx.storage.memory("summary", {
      initial: {}
    });
    const summaryAt = new Map();
    const summaryLoading = new Set();
    const ensureSummary = (sessionID, force = false) => {
      if (!sessionID || summaryLoading.has(sessionID)) return;
      if (!force && Date.now() - (summaryAt.get(sessionID) ?? 0) < 3000) return;
      summaryAt.set(sessionID, Date.now());
      summaryLoading.add(sessionID);
      void ctx.client.session.context({
        sessionID
      }).then(messages => {
        setSummary(draft => {
          draft[sessionID] = summarize(messages);
        });
      }).catch(() => {}).finally(() => summaryLoading.delete(sessionID));
    };
    const [view, setView] = ctx.storage.store("view", {
      initial: {
        open: true
      }
    });
    const [ui, setUI] = ctx.storage.memory("ui", {
      initial: {
        width: 34
      }
    });
    const live = new Map();
    const set = (sessionID, patch) => {
      setMetrics(draft => {
        draft[sessionID] = {
          ...(draft[sessionID] ?? {
            active: false
          }),
          ...patch
        };
      });
    };
    const finish = sessionID => {
      const item = live.get(sessionID);
      const message = lastAssistant(ctx.data.session.message.list(sessionID));
      live.delete(sessionID);
      set(sessionID, {
        active: false,
        cacheHit: item ? metrics[sessionID]?.cacheHit : hitRate(message?.tokens),
        tps: metrics[sessionID]?.tps ?? exactTps(message)
      });
    };
    const stop = ctx.data.listen(({
      details
    }) => {
      const event = details;
      const data = event.data ?? {};
      switch (event.type) {
        case "session.step.started":
          ensureSummary(data.sessionID, true);
          live.set(data.sessionID, {
            startedAt: data.started > 0 ? data.started : Date.now(),
            tokens: 0,
            messageID: data.assistantMessageID
          });
          set(data.sessionID, {
            active: true,
            ttft: undefined,
            tps: undefined
          });
          break;
        case "session.step.streamed":
          {
            const item = live.get(data.sessionID);
            if (item) item.streamedAt = Date.now();
            break;
          }
        case "session.message.content.updated":
          {
            const item = live.get(data.sessionID);
            if (!item) break;
            if (item.messageID && data.messageID !== item.messageID) break;
            if (!item.firstTokenAt) {
              item.firstTokenAt = Date.now();
              set(data.sessionID, {
                active: true,
                ttft: Math.max(0, item.firstTokenAt - item.startedAt)
              });
            }
            let tokens = 0;
            for (const part of data.content) {
              if ((part.type === "text" || part.type === "reasoning") && part.text) {
                tokens += estimate(part.text);
              }
            }
            item.tokens = tokens;
            break;
          }
        case "session.step.ended":
          {
            const item = live.get(data.sessionID);
            const tokens = data.tokens;
            const start = item?.startedAt ?? Date.now();
            const end = item?.streamedAt ?? Date.now();
            const seconds = (end - start) / 1000;
            const output = tokens.output + tokens.reasoning;
            set(data.sessionID, {
              active: false,
              cacheHit: hitRate(tokens),
              tps: seconds > 0 && output > 0 ? output / seconds : undefined
            });
            live.delete(data.sessionID);
            ensureSummary(data.sessionID, true);
            break;
          }
        case "session.execution.succeeded":
        case "session.execution.failed":
        case "session.execution.interrupted":
        case "session.idle":
          if (data.sessionID) {
            ensureSummary(data.sessionID, true);
            finish(data.sessionID);
          }
          break;
      }
    });
    const timer = setInterval(() => {
      if (live.size === 0) return;
      const now = Date.now();
      setMetrics(draft => {
        for (const [sessionID, item] of live) {
          if (!item.firstTokenAt || item.tokens <= 0) continue;
          const seconds = (now - item.firstTokenAt) / 1000;
          if (seconds <= 0) continue;
          const previous = draft[sessionID] ?? {
            active: true
          };
          const tps = item.tokens / seconds;
          draft[sessionID] = {
            ...previous,
            active: true,
            tps
          };
        }
      });
    }, 500);
    const dispose = ctx.ui.slot({
      prepend: "sidebar.content",
      render: ({
        sessionID
      }) => _$createComponent(Panel, {
        ctx: ctx,
        sessionID: sessionID,
        metrics: metrics,
        summary: summary,
        ensureSummary: ensureSummary,
        view: view,
        setView: setView,
        ui: ui,
        setUI: setUI
      })
    });
    return () => {
      clearInterval(timer);
      stop();
      dispose();
    };
  }
});