import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from './settings.js';

// 可配置 AI 模型客户端
// 配置来源：system_setting（管理员端「集成配置」维护，优先） → 环境变量（兜底）
//  ai.provider  anthropic | openai-compatible（DeepSeek/通义/Kimi 等兼容 /chat/completions 的服务）
//  ai.base      接口地址（anthropic 可留空走官方；openai-compatible 必填，如 https://api.deepseek.com/v1）
//  ai.key       API Key
//  ai.model     模型名（anthropic 默认 claude-opus-4-8）
export interface LlmCfg {
  provider: 'anthropic' | 'openai-compatible';
  base: string;
  key: string;
  model: string;
  enabled: boolean;
}

export async function getLlmCfg(orgId: number): Promise<LlmCfg> {
  const [dbProvider, dbBase, dbKey, dbModel] = await Promise.all([
    getSetting(orgId, 'ai.provider'),
    getSetting(orgId, 'ai.base'),
    getSetting(orgId, 'ai.key'),
    getSetting(orgId, 'ai.model'),
  ]);
  const provider = (dbProvider || process.env.AI_PROVIDER || 'anthropic') as LlmCfg['provider'];
  const base = dbBase || process.env.AI_API_BASE || '';
  const key = dbKey || process.env.AI_API_KEY || '';
  const model = dbModel || process.env.AI_MODEL || (provider === 'anthropic' ? 'claude-opus-4-8' : '');
  return { provider, base, key, model, enabled: !!(key && model && (provider === 'anthropic' || base)) };
}

/** 单轮对话补全，返回模型文本。抛错时带可读信息（供接口透出）。 */
export async function chatComplete(cfg: LlmCfg, system: string, user: string, maxTokens = 4000): Promise<string> {
  if (cfg.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: cfg.key, ...(cfg.base ? { baseURL: cfg.base } : {}), timeout: 120_000 });
    const msg = await client.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
  // OpenAI 兼容协议（DeepSeek / 通义 / Kimi / vLLM 等）
  const base = cfg.base.replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => null)) as any;
  if (!res.ok) throw new Error(`模型接口 ${res.status}：${body?.error?.message ?? body?.message ?? '调用失败'}`);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('模型返回格式异常（无 choices[0].message.content）');
  return text;
}

// ---------- 工具调用（Agentic loop）：AI 助手用，支持两种协议 ----------

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export type ToolExec = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const MAX_ROUNDS = 8;

/**
 * 多轮工具调用循环：模型可连续调用工具（查询→创建→…）直至给出最终回复。
 * 工具执行结果（含报错文案）原样回传模型，由模型决定重试或向用户说明。
 */
export async function chatWithTools(
  cfg: LlmCfg, system: string, history: ChatTurn[], tools: ToolDef[], exec: ToolExec, maxTokens = 3000,
): Promise<string> {
  if (cfg.provider === 'anthropic') return anthropicToolLoop(cfg, system, history, tools, exec, maxTokens);
  return openaiToolLoop(cfg, system, history, tools, exec, maxTokens);
}

async function anthropicToolLoop(
  cfg: LlmCfg, system: string, history: ChatTurn[], tools: ToolDef[], exec: ToolExec, maxTokens: number,
): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.key, ...(cfg.base ? { baseURL: cfg.base } : {}), timeout: 180_000 });
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolDefs: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await client.messages.create({ model: cfg.model, max_tokens: maxTokens, system, tools: toolDefs, messages });
    if (msg.stop_reason !== 'tool_use') {
      return msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    }
    messages.push({ role: 'assistant', content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue;
      const out = await runTool(exec, block.name, block.input as Record<string, unknown>);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out), is_error: !!(out as any)?.error });
    }
    messages.push({ role: 'user', content: results });
  }
  return '操作轮次过多，已停止。请拆分成更小的请求再试。';
}

async function openaiToolLoop(
  cfg: LlmCfg, system: string, history: ChatTurn[], tools: ToolDef[], exec: ToolExec, maxTokens: number,
): Promise<string> {
  const base = cfg.base.replace(/\/+$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const messages: any[] = [{ role: 'system', content: system }, ...history];
  const toolDefs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages, tools: toolDefs }),
      signal: AbortSignal.timeout(180_000),
    });
    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(`模型接口 ${res.status}：${body?.error?.message ?? body?.message ?? '调用失败'}`);
    const m = body?.choices?.[0]?.message;
    if (!m) throw new Error('模型返回格式异常（无 choices[0].message）');
    if (!Array.isArray(m.tool_calls) || m.tool_calls.length === 0) return String(m.content ?? '');
    messages.push(m);
    for (const call of m.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* 参数解析失败按空参处理，错误由工具返回 */ }
      const out = await runTool(exec, call.function?.name, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return '操作轮次过多，已停止。请拆分成更小的请求再试。';
}

async function runTool(exec: ToolExec, name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    return await exec(name, args);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 让模型输出 JSON 并宽松解析（剥 ```json 围栏、截取首尾大括号）。 */
export function parseJsonLoose<T>(text: string): T {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as T;
}
