import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.extend(quarterOfYear);
dayjs.locale('zh-cn');

export function formatDate(value?: string | number | null, fmt = 'YYYY-MM-DD'): string {
  if (!value) return '—';
  return dayjs(value).format(fmt);
}

export function formatDateTime(value?: string | number | null): string {
  if (!value) return '—';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

export function fromNow(value?: string | number | null): string {
  if (!value) return '—';
  return dayjs(value).fromNow();
}

/** 距今天数（正=已过期天数 / 负=剩余天数） */
export function daysFromNow(value?: string | number | null): number {
  if (!value) return 0;
  return dayjs().startOf('day').diff(dayjs(value).startOf('day'), 'day');
}

/** 距离到期天数（正=剩余 / 负=已逾期） */
export function daysUntil(value?: string | number | null): number {
  if (!value) return 0;
  return dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day');
}

export { dayjs };
