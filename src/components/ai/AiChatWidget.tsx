import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, ExternalLink, Eraser, Send, Sparkles, X } from 'lucide-react';
import { aiApi } from '@/api/crm';
import { cn } from '@/lib/cn';
import type { AiChatAction } from '@/types';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  actions?: AiChatAction[];
}

// 轻量 Markdown 表格渲染：把回复中的 |a|b| 表格块渲染为真实表格，其余按原文换行显示
function isTableRow(line: string) {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}
const isSeparatorRow = (line: string) => /^\|?[\s:\-|]+\|?$/.test(line.trim()) && line.includes('-');
const splitCells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

function MsgContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ({ type: 'text'; lines: string[] } | { type: 'table'; header: string[]; rows: string[][] })[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitCells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, rows });
    } else {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'text') last.lines.push(lines[i]);
      else blocks.push({ type: 'text', lines: [lines[i]] });
      i++;
    }
  }
  return (
    <>
      {blocks.map((b, bi) =>
        b.type === 'text' ? (
          b.lines.join('\n').trim() ? <p key={bi} className="whitespace-pre-wrap">{b.lines.join('\n').replace(/^\n+|\n+$/g, '')}</p> : null
        ) : (
          <div key={bi} className="my-1.5 overflow-x-auto rounded-md border border-border/70">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg/80 text-left text-text-weak">
                  {b.header.map((h, hi) => <th key={hi} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-border/50">
                    {r.map((c, ci) => <td key={ci} className="px-2 py-1 align-top">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </>
  );
}

const SUGGESTIONS = [
  '创建客户 云启数据科技有限公司',
  '给云启数据创建商机 预计50万',
  '给云启数据写跟进 今天电话沟通了数据API需求',
  '给云启数据出一份报价单，含数据API套餐 1 份',
];

/**
 * 全局 AI 助手：对话式完成 CRM 操作（建客户/商机/报价草稿、加跟进/联系人、查客户全景）。
 * 后端通过工具调用在当前用户权限下真实落库；执行过的操作以卡片形式展示并可跳转。
 */
export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next: Msg[] = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setBusy(true);
    try {
      const r = await aiApi.chat(next.map(({ role, content: c }) => ({ role, content: c })));
      setMsgs((cur) => [...cur, { role: 'assistant', content: r.reply, actions: r.actions }]);
    } catch (e) {
      setMsgs((cur) => [...cur, { role: 'assistant', content: e instanceof Error ? e.message : '请求失败，请重试。' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* 浮动入口 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#8B5CF6] text-white shadow-lg transition-transform hover:scale-105"
        title="AI 助手（对话式操作）"
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {/* 对话面板 */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[560px] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-[#8B5CF6] text-white">
              <Bot size={15} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-text">AI 助手</div>
              <div className="text-xs text-text-faint">对话完成建客户 / 商机 / 报价、写跟进等操作</div>
            </div>
            {msgs.length > 0 && (
              <button onClick={() => setMsgs([])} className="text-text-faint hover:text-danger" title="清空对话">
                <Eraser size={15} />
              </button>
            )}
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3 pt-4 text-center">
                <Sparkles className="mx-auto text-text-faint" size={26} />
                <p className="text-sm text-text-weak">用一句话完成 CRM 操作，试试：</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full rounded-md border border-border px-3 py-1.5 text-left text-xs text-text-weak hover:border-primary hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[88%] space-y-2', m.role === 'user' && 'text-right')}>
                  <div
                    className={cn(
                      'inline-block rounded-lg px-3 py-2 text-left text-sm leading-relaxed',
                      m.role === 'user' ? 'whitespace-pre-wrap bg-primary text-white' : 'bg-bg text-text',
                    )}
                  >
                    {m.role === 'assistant' ? <MsgContent text={m.content} /> : m.content}
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="space-y-1">
                      {m.actions.map((a, j) => (
                        <ActionChip key={j} action={a} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-text-faint">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                正在思考并执行…
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
              placeholder="如：给小米汽车创建商机 预计80万"
              className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none placeholder:text-text-faint focus:border-primary"
              disabled={busy}
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ActionChip({ action }: { action: AiChatAction }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/5 px-2.5 py-1 text-xs text-success">
      ✓ {action.label}
      {action.link && <ExternalLink size={11} />}
    </span>
  );
  return action.link ? <Link to={action.link} className="block hover:opacity-80">{inner}</Link> : <div>{inner}</div>;
}
