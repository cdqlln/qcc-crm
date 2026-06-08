import { useState } from 'react';
import { Bookmark, Pin, Plus, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUI } from '@/store/ui';

export interface SavedView {
  id: string;
  name: string;
  scope: 'mine' | 'team';
  pinned?: boolean;
  /** 视图绑定的筛选条件与 Tab（选中即应用） */
  tab?: string;
  filters?: Record<string, unknown>;
}

// §4.3 SavedViewBar：保存的筛选视图（我的/团队/置顶）
export function SavedViewBar({
  views,
  active,
  onSelect,
  onSave,
}: {
  views: SavedView[];
  active?: string;
  onSelect: (id: string) => void;
  onSave: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const toast = useUI((s) => s.toast);

  const submit = () => {
    if (name.trim()) {
      onSave(name.trim());
      toast(`视图「${name.trim()}」已保存`, 'success');
    }
    setName('');
    setAdding(false);
  };

  const sorted = [...views].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
            v.id === active
              ? 'border-primary bg-primary-weak text-primary'
              : 'border-border bg-surface text-text-weak hover:text-text',
          )}
        >
          {v.pinned ? <Pin size={11} /> : v.scope === 'team' ? <Star size={11} /> : <Bookmark size={11} />}
          {v.name}
        </button>
      ))}
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="视图名称"
          className="h-7 w-28 rounded-full border border-primary bg-surface px-2.5 text-xs outline-none"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-faint hover:text-text"
        >
          <Plus size={11} /> 保存当前视图
        </button>
      )}
    </div>
  );
}
