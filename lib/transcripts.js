'use strict';
// Turns Claude Code transcript lines (~/.claude/projects/**.jsonl) into small typed events.
// One Parser per file. It remembers tool names by id so results can be matched to their call.

const path = require('path');

const QUARRY = new Set(['Read', 'NotebookRead', 'Glob', 'Grep', 'LS', 'ToolSearch', 'TaskOutput', 'TaskGet',
  'TaskList', 'ListAgents', 'ReadNotifications', 'FetchInboxMessage', 'CronList', 'BashOutput']);
const BUILD = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const HAUL = new Set(['Bash', 'PowerShell', 'Monitor', 'TaskStop', 'RemoteTrigger', 'CronCreate', 'CronDelete', 'KillShell']);
const CONSCRIPT = new Set(['Agent', 'Task', 'Workflow', 'SendMessage']);
const QUOTA = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode']);
const ASK = new Set(['AskUserQuestion', 'ExitPlanMode']);
const STRAW = new Set(['WebSearch', 'WebFetch']);

const READ_CMD = /^\s*(cd\s+[^&;]+&&\s*)?(cat|head|tail|ls|dir|grep|rg|find|wc|stat|du|sed -n|git (status|log|diff|show|blame)|type|Get-Content|Get-ChildItem)\b/i;
// web tools run from the shell, also behind env settings (FOO=1 curl ...) or a full path ("/usr/bin/curl")
const WEB_CMD = /^\s*(cd\s+[^&;]+&&\s*)?(\w+=\S*\s+)*"?(\S*[\\/])?(firecrawl|monid|curl|wget)(\.exe|\.cmd)?"?(\s|$)/i;

function classify(name, input) {
  if (!name) return 'haul';
  if (BUILD.has(name)) return 'build';
  if (QUARRY.has(name)) return 'quarry';
  if (STRAW.has(name)) return 'straw';
  if (CONSCRIPT.has(name)) return 'conscript';
  if (QUOTA.has(name)) return 'quota';
  if (ASK.has(name)) return 'ask';
  if (name === 'ScheduleWakeup') return 'sleep';
  if (name === 'Skill') return 'scroll';
  if (name === 'Artifact' || /__(write_files|create_project|copy_files)$/.test(name)) return 'build';
  if (/^mcp__(playwright|claude-in-chrome)__/.test(name) || /render_preview|screenshot/.test(name)) return 'survey';
  if (/^mcp__firecrawl|search|scrape|fetch/i.test(name)) return 'straw';
  if (name === 'Bash' || name === 'PowerShell') {
    const cmd = (input && input.command) || '';
    if (WEB_CMD.test(cmd)) return 'straw';
    if (READ_CMD.test(cmd)) return 'quarry';
    return 'haul';
  }
  if (HAUL.has(name)) return 'haul';
  return 'haul';
}

const base = (p) => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() || '' : '');
const clip = (s, n) => {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// What the name tag should say for a tool call. `target` is the thing being worked on.
function summarize(name, input) {
  input = input || {};
  const out = { target: '', file: '', cmd: '' };
  switch (name) {
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': case 'NotebookRead':
      out.file = input.file_path || input.notebook_path || '';
      out.target = base(out.file);
      break;
    case 'Bash': case 'PowerShell':
      out.cmd = clip(input.command, 300);
      out.target = clip(input.description || input.command, 60);
      break;
    case 'Grep': out.target = clip(`“${input.pattern || ''}”`, 48); break;
    case 'Glob': out.target = clip(input.pattern, 48); break;
    case 'WebSearch': out.target = clip(input.query, 56); break;
    case 'WebFetch': {
      try { out.target = new URL(input.url).hostname.replace(/^www\./, ''); } catch { out.target = clip(input.url, 40); }
      break;
    }
    case 'Agent': case 'Task':
      out.target = clip(input.description || input.subagent_type || 'a helper', 56);
      out.agentType = input.subagent_type || '';
      break;
    case 'Workflow': out.target = clip((input.name || 'workflow') , 48); break;
    case 'Skill': out.target = clip(input.skill, 40); break;
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? input.todos : [];
      out.target = `${todos.length} tasks`;
      out.todos = todos.slice(0, 8).map((t) => ({ text: clip(t.content || t.subject || '', 60), status: t.status || 'pending' }));
      break;
    }
    case 'TaskCreate': case 'TaskUpdate': out.target = clip(input.subject || input.status || '', 48); break;
    case 'AskUserQuestion': {
      const q = Array.isArray(input.questions) && input.questions[0];
      out.target = clip(q ? q.question : '', 80);
      break;
    }
    case 'ScheduleWakeup': out.target = input.delaySeconds ? `${Math.round(input.delaySeconds / 60)} min` : ''; break;
    case 'ToolSearch': out.target = clip(input.query, 40); break;
    case 'SendMessage': out.target = clip(input.to, 30); break;
    default: {
      if (name && name.startsWith('mcp__')) {
        const parts = name.split('__');
        out.target = clip(`${parts[1]} ${(parts[2] || '').replace(/_/g, ' ')}`, 48);
        if (input.url) out.target = clip(input.url, 48);
      } else {
        out.target = clip(input.description || input.url || input.query || '', 48);
      }
    }
  }
  return out;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
}

function resultText(block) {
  const c = block && block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (x && x.type === 'text' ? x.text : '')).join('\n');
  return '';
}

// ctx: { sid, aid, pid, proj, projName, sub }
class Parser {
  constructor(ctx) {
    this.ctx = ctx;
    this.tools = new Map(); // tool_use id -> { name, cat, file, cmd }
    this.seenMsg = new Set();
    this.model = null;
  }

  ev(k, t, extra) {
    const c = this.ctx;
    return Object.assign({ k, t, sid: c.sid, aid: c.aid, pid: c.pid || null, proj: c.proj }, extra);
  }

  // Returns an array of events for one JSONL line.
  line(raw) {
    if (!raw || raw.length < 2) return [];
    let d;
    try { d = JSON.parse(raw); } catch { return []; }
    const t = d.timestamp ? Date.parse(d.timestamp) : 0; // title/mode lines carry no time
    const out = [];
    switch (d.type) {
      case 'assistant': this.assistant(d, t, out); break;
      case 'user': this.user(d, t, out); break;
      case 'system': this.system(d, t, out); break;
      case 'custom-title': if (d.customTitle) out.push(this.ev('title', t, { title: clip(d.customTitle, 70), custom: true })); break;
      case 'ai-title': if (d.aiTitle) out.push(this.ev('title', t, { title: clip(d.aiTitle, 70) })); break;
      case 'mode': out.push(this.ev('mode', t, { mode: d.mode })); break;
      default: break;
    }
    return out;
  }

  assistant(d, t, out) {
    const m = d.message || {};
    if (m.model && m.model !== '<synthetic>' && m.model !== this.model) {
      const prev = this.model;
      this.model = m.model;
      out.push(this.ev('model', t, { model: m.model, prev }));
    }
    if (m.id && m.usage && !this.seenMsg.has(m.id)) {
      this.seenMsg.add(m.id);
      if (this.seenMsg.size > 4000) this.seenMsg = new Set([...this.seenMsg].slice(-2000));
      const u = m.usage;
      const tokens = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (tokens) out.push(this.ev('tokens', t, { tokens, out: u.output_tokens || 0 }));
    }
    const content = Array.isArray(m.content) ? m.content : [];
    const uses = [];
    for (const b of content) {
      if (!b) continue;
      if (b.type === 'thinking' || b.type === 'redacted_thinking') out.push(this.ev('think', t, {}));
      else if (b.type === 'text' && b.text && b.text.trim()) out.push(this.ev('text', t, { text: clip(b.text, 220) }));
      else if (b.type === 'tool_use') {
        const cat = classify(b.name, b.input);
        const s = summarize(b.name, b.input);
        this.tools.set(b.id, { name: b.name, cat, file: s.file, cmd: s.cmd });
        if (this.tools.size > 800) this.tools.delete(this.tools.keys().next().value);
        uses.push(this.ev('tool', t, Object.assign({ id: b.id, name: b.name, cat }, s)));
      }
    }
    if (uses.length > 1) uses.forEach((u) => { u.batch = uses.length; });
    out.push(...uses);
    if (m.stop_reason === 'end_turn') out.push(this.ev('end', t, {}));
  }

  user(d, t, out) {
    const m = d.message || {};
    const c = m.content;
    if (d.toolDenialKind) out.push(this.ev('deny', t, { kind: d.toolDenialKind }));
    if (Array.isArray(c)) {
      let human = '';
      for (const b of c) {
        if (!b) continue;
        if (b.type === 'tool_result') {
          const info = this.tools.get(b.tool_use_id) || {};
          this.tools.delete(b.tool_use_id);
          const txt = resultText(b);
          const err = !!b.is_error;
          const r = d.toolUseResult && typeof d.toolUseResult === 'object' ? d.toolUseResult : {};
          const extra = { id: b.tool_use_id, name: info.name || '', cat: info.cat || 'haul', err, file: info.file || '', cmd: info.cmd || '' };
          if (err) extra.errText = clip(txt.replace(/<\/?tool_use_error>/g, ''), 140);
          if (r.agentId) extra.agentId = r.agentId;
          if (info.name === 'Bash' && typeof txt === 'string') {
            const mm = /^Exit code (\d+)/.exec(txt);
            if (mm) extra.exit = Number(mm[1]);
            if (/\b(\d+) (failed|failing)\b|FAILED|✗|AssertionError/.test(txt)) extra.testFail = true;
          }
          if (/\[Request interrupted by user/.test(txt)) extra.interrupted = true;
          out.push(this.ev('done', t, extra));
        } else if (b.type === 'text') {
          human += (human ? '\n' : '') + b.text;
        }
      }
      if (human) this.humanText(d, t, human, out);
    } else if (typeof c === 'string') {
      this.humanText(d, t, c, out);
    }
  }

  humanText(d, t, text, out) {
    if (d.isMeta || d.isCompactSummary) return;
    if (/^\[Request interrupted by user/.test(text)) { out.push(this.ev('interrupt', t, {})); return; }
    if (/^\s*<(local-command|system-reminder|task-notification|bash-|user-memory)/.test(text)) return;
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(text);
    if (cmd) {
      out.push(this.ev('prompt', t, { text: cmd[1].trim(), slash: true }));
      return;
    }
    const kind = d.origin && d.origin.kind;
    const clean = text.replace(/<[^>]+>/g, ' ').trim();
    if (!clean) return;
    // Subagents get their orders as the first "user" message; the main session gets human prompts.
    if (this.ctx.sub) out.push(this.ev('orders', t, { text: clip(clean, 160) }));
    else if (!kind || kind === 'human') out.push(this.ev('prompt', t, { text: clip(clean, 160) }));
  }

  system(d, t, out) {
    if (d.subtype === 'api_error') {
      const e = d.error || {};
      out.push(this.ev('apierr', t, { text: clip(e.formatted || e.message || 'API error', 100), attempt: d.retryAttempt || 0 }));
    } else if (d.subtype === 'compact_boundary') {
      out.push(this.ev('compact', t, { trigger: (d.compactMetadata && d.compactMetadata.trigger) || 'auto' }));
    } else if (d.subtype === 'stop_hook_summary') {
      out.push(this.ev('stophook', t, {}));
    }
  }
}

// Figures out who a transcript file belongs to from its path.
//   <root>/<slug>/<sid>.jsonl                                   main session
//   <root>/<slug>/<sid>/subagents/agent-<id>.jsonl              subagent
//   <root>/<slug>/<sid>/subagents/workflows/<run>/agent-<id>.jsonl  workflow agent
function identify(root, file) {
  const rel = path.relative(root, file).split(path.sep);
  const slug = rel[0];
  const proj = slug.toLowerCase();
  if (rel.length === 2) {
    const sid = rel[1].replace(/\.jsonl$/, '');
    return { proj, slug, sid, aid: sid, pid: null, sub: false };
  }
  if (rel.length >= 4 && rel[2] === 'subagents') {
    const sid = rel[1];
    const id = rel[rel.length - 1].replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const run = rel[3] === 'workflows' ? rel[4] : null;
    return { proj, slug, sid, aid: `${sid}:${id}`, agentId: id, pid: sid, sub: true, run };
  }
  return null;
}

module.exports = { Parser, classify, summarize, identify, clip, base };
