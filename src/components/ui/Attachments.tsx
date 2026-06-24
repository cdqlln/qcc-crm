import { FileText, X } from 'lucide-react';
import { assetUrl } from '@/api/crm';
import type { Attachment } from '@/types';

const isImage = (a: Attachment) => a.mime?.startsWith('image/');
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

// 跟进附件展示：图片缩略图 + 文件下载
export function Attachments({ items }: { items?: Attachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a, i) => {
        const href = assetUrl(a.url);
        return isImage(a) ? (
          <a key={i} href={href} target="_blank" rel="noreferrer" title={a.name}>
            <img src={href} alt={a.name} className="h-16 w-16 rounded-md border border-border object-cover" />
          </a>
        ) : (
          <a key={i} href={href} target="_blank" rel="noreferrer" download={a.name}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-weak hover:text-primary">
            <FileText size={13} />
            <span className="max-w-[140px] truncate">{a.name}</span>
            <span className="text-text-faint">{fmtSize(a.size)}</span>
          </a>
        );
      })}
    </div>
  );
}

// 上传中/待提交的附件预览（可删除）
export function AttachmentDrafts({ items, onRemove }: { items: Attachment[]; onRemove: (i: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-weak">
          {a.mime?.startsWith('image/') ? <img src={assetUrl(a.url)} className="h-4 w-4 rounded object-cover" alt="" /> : <FileText size={12} />}
          <span className="max-w-[120px] truncate">{a.name}</span>
          <button onClick={() => onRemove(i)} className="text-text-faint hover:text-danger"><X size={11} /></button>
        </span>
      ))}
    </div>
  );
}
