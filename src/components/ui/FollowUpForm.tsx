import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { customersApi, uploadApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { Button } from '@/components/ui/primitives';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { AttachmentDrafts } from '@/components/ui/Attachments';

/**
 * 通用跟进表单：客户/线索/商机 三处共用（businessType 0线索 1客户 3商机）。
 * 全部汇总到客户跟进时间线并按来源标注；支持图片与文件附件。
 */
export function FollowUpForm({ customerId, businessType = 1, businessId, onDone }: {
  customerId: number;
  businessType?: 0 | 1 | 3;
  businessId?: number;
  onDone: () => void;
}) {
  const term = useTerm();
  const toast = useUI((s) => s.toast);
  const [comment, setComment] = useState('');
  const [type, setType] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<import('@/types').Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      const up = await uploadApi.upload(picked);
      setFiles((f) => [...f, ...up]);
    } catch (err) {
      toast(err instanceof Error ? err.message : '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!comment.trim()) return toast('请填写跟进内容', 'error');
    setBusy(true);
    try {
      await customersApi.createTracking(customerId, {
        comment: comment.trim(),
        trackingType: type ? Number(type) : undefined,
        nextTrackingDate: next || undefined,
        attachments: files,
        businessType,
        businessId,
      });
      toast(next ? '跟进已记录，已生成下次跟进待办' : '跟进已记录', 'success');
      setComment(''); setType(''); setNext(''); setFiles([]);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '提交失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="跟进方式">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">选择方式</option>
            {term.options(TERMS_BIZ.followType).map((t) => <option key={t.termId} value={t.termId}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="下次跟进时间"><TextInput type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
      <Field label="跟进内容"><TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="记录沟通要点…" /></Field>
      <AttachmentDrafts items={files} onRemove={(i) => setFiles((f) => f.filter((_, x) => x !== i))} />
      <div className="flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-weak hover:text-primary">
          <Paperclip size={14} />{uploading ? '上传中…' : '附件/图片'}
          <input type="file" multiple className="hidden" onChange={onPick} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt" />
        </label>
        <Button variant="primary" onClick={submit} disabled={busy || uploading}>保存跟进</Button>
      </div>
    </div>
  );
}
