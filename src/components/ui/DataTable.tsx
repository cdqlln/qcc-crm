import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Rows2, Rows3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUI } from '@/store/ui';
import { TableSkeleton, EmptyState, ErrorState } from './states';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** 列最小宽度（px），防止窄屏被压缩 */
  minWidth?: number;
  sortable?: boolean;
  /** 数字列：等宽数字 + 右对齐 */
  numeric?: boolean;
  /** 超长单行截断：true=默认 200px，或指定最大像素宽 */
  truncate?: boolean | number;
}

export interface BulkAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (rows: T[]) => void;
  danger?: boolean;
}

export interface SortState {
  id: string;
  desc: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  toolbar?: React.ReactNode;
  topBar?: React.ReactNode;
  sort?: SortState;
  onSortChange?: (s: SortState | undefined) => void;
  pagination?: { page: number; pageSize: number; total: number; onChange: (page: number) => void };
  emptyAction?: React.ReactNode;
}

// §4.3/§4.4 统一 DataTable：密度切换、排序、行选、批量操作条、分页、三件套
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  selectable,
  bulkActions,
  toolbar,
  topBar,
  sort,
  onSortChange,
  pagination,
  emptyAction,
}: DataTableProps<T>) {
  const { density, setDensity } = useUI();
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const rowH = density === 'compact' ? 'h-9' : 'h-12';
  const selectedRows = useMemo(() => data.filter((r) => selected.has(rowKey(r))), [data, selected, rowKey]);

  const allChecked = data.length > 0 && data.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(data.map(rowKey)));
  };
  const toggleRow = (k: string | number) => {
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    setSelected(next);
  };

  const clickSort = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    if (sort?.id !== col.key) onSortChange({ id: col.key, desc: false });
    else if (!sort.desc) onSortChange({ id: col.key, desc: true });
    else onSortChange(undefined);
  };

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface shadow-card">
      {/* 工具栏 + 密度切换 */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">{topBar}</div>
        <div className="flex items-center gap-2">
          {toolbar}
          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              onClick={() => setDensity('comfortable')}
              className={cn('rounded p-1', density === 'comfortable' ? 'bg-bg text-primary' : 'text-text-faint')}
              title="舒适"
            >
              <Rows2 size={15} />
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={cn('rounded p-1', density === 'compact' ? 'bg-bg text-primary' : 'text-text-faint')}
              title="紧凑"
            >
              <Rows3 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 批量操作条 */}
      {selectable && selectedRows.length > 0 && (
        <div className="flex items-center gap-2 border-y border-primary-weak bg-primary-weak px-3 py-2 text-sm">
          <span className="text-primary">已选 {selectedRows.length} 项</span>
          <div className="h-3 w-px bg-primary/30" />
          {bulkActions?.map((a) => (
            <button
              key={a.label}
              onClick={() => a.onClick(selectedRows)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-surface',
                a.danger ? 'text-danger' : 'text-text',
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-text-weak hover:text-text">
            取消选择
          </button>
        </div>
      )}

      {/* 表体 */}
      <div className="overflow-auto">
        {error ? (
          <ErrorState onRetry={onRetry} />
        ) : loading ? (
          <TableSkeleton cols={columns.length + (selectable ? 1 : 0)} />
        ) : data.length === 0 ? (
          <EmptyState action={emptyAction} />
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/60">
                {selectable && (
                  <th className="w-10 px-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="cursor-pointer" />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{ width: col.width, minWidth: col.minWidth, textAlign: col.numeric ? 'right' : col.align ?? 'left' }}
                    className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-xs font-medium text-text-weak',
                      col.sortable && 'cursor-pointer select-none hover:text-text',
                    )}
                    onClick={() => clickSort(col)}
                  >
                    <span className={cn('inline-flex items-center gap-1', col.numeric && 'flex-row-reverse')}>
                      {col.header}
                      {col.sortable && sort?.id === col.key && (sort.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const k = rowKey(row);
                return (
                  <tr
                    key={k}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'border-b border-border last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-primary-weak/40',
                      selected.has(k) && 'bg-primary-weak/30',
                    )}
                  >
                    {selectable && (
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(k)}
                          onChange={() => toggleRow(k)}
                          className="cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const maxW = col.truncate === true ? 200 : typeof col.truncate === 'number' ? col.truncate : undefined;
                      const content = col.render
                        ? col.render(row)
                        : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                      return (
                        <td
                          key={col.key}
                          style={{ textAlign: col.numeric ? 'right' : col.align ?? 'left', minWidth: col.minWidth }}
                          className={cn(rowH, 'whitespace-nowrap px-3 align-middle text-text', col.numeric && 'tabular-nums')}
                        >
                          {maxW != null ? (
                            <div className="truncate" style={{ maxWidth: maxW }} title={typeof content === 'string' ? content : undefined}>
                              {content}
                            </div>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {pagination && !loading && !error && data.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2.5 text-sm text-text-weak">
          <span>
            共 <b className="text-text">{pagination.total}</b> 条
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => pagination.onChange(pagination.page - 1)}
              className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-bg"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2">
              {pagination.page} / {totalPages}
            </span>
            <button
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onChange(pagination.page + 1)}
              className="rounded-md border border-border p-1 disabled:opacity-40 hover:bg-bg"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
