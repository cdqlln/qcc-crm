import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListParams } from '@/api/client';
import type { PageResult } from '@/types';
import type { SortState } from '@/components/ui/DataTable';

export type FilterValue = Record<string, unknown>;

function countActive(filters: FilterValue): number {
  return Object.values(filters).filter((v) => {
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some((x) => x !== undefined && x !== null && x !== '');
    return true;
  }).length;
}

// 统一列表状态管理：tab / 关键字 / 分页 / 排序 / 高级筛选 + TanStack Query
export function useListQuery<T>(
  key: string,
  fetcher: (p: ListParams) => Promise<PageResult<T>>,
  opts: { pageSize?: number; defaultTab?: string } = {},
) {
  const [tab, setTabRaw] = useState(opts.defaultTab ?? 'all');
  const [keyword, setKeywordRaw] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | undefined>();
  const [filters, setFiltersRaw] = useState<FilterValue>({});

  const pageSize = opts.pageSize ?? 20;
  const params: ListParams = { tab, keyword, page, pageSize, sort, filters };

  const query = useQuery({
    queryKey: [key, tab, keyword, page, sort, filters],
    queryFn: () => fetcher(params),
    placeholderData: keepPreviousData,
  });

  return {
    tab,
    setTab: (t: string) => {
      setTabRaw(t);
      setPage(1);
    },
    keyword,
    setKeyword: (k: string) => {
      setKeywordRaw(k);
      setPage(1);
    },
    page,
    setPage,
    sort,
    setSort,
    filters,
    setFilters: (f: FilterValue) => {
      setFiltersRaw(f);
      setPage(1);
    },
    filterCount: countActive(filters),
    /** 整体应用一个已保存视图（tab + filters） */
    applyView: (view: { tab?: string; filters?: FilterValue }) => {
      if (view.tab) setTabRaw(view.tab);
      setFiltersRaw(view.filters ?? {});
      setPage(1);
    },
    data: query.data?.list ?? [],
    total: query.data?.total ?? 0,
    pageSize,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
