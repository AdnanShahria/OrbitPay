/**
 * Utility functions for currency, dates, and MFS display formatting.
 */

export function formatBDT(amount: number): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace('BDT', '৳');
}

export function formatDate(date: string | number | Date | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d);
}

export function formatRelativeTime(date: string | number | Date | null | undefined): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export type MfsProvider = 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'CELLFIN';

export const MFS_METADATA: Record<
  MfsProvider,
  { name: string; color: string; hoverColor: string; bgSoft: string; textClass: string; borderClass: string }
> = {
  BKASH: {
    name: 'bKash',
    color: '#E2136E',
    hoverColor: '#C20F5D',
    bgSoft: 'rgba(226, 19, 110, 0.08)',
    textClass: 'text-[#E2136E]',
    borderClass: 'border-[#E2136E]/25',
  },
  NAGAD: {
    name: 'Nagad',
    color: '#F7941D',
    hoverColor: '#DE7F10',
    bgSoft: 'rgba(247, 148, 29, 0.08)',
    textClass: 'text-[#C9730B]',
    borderClass: 'border-[#F7941D]/25',
  },
  ROCKET: {
    name: 'Rocket',
    color: '#8C3494',
    hoverColor: '#752B7D',
    bgSoft: 'rgba(140, 52, 148, 0.08)',
    textClass: 'text-[#9A3BA3]',
    borderClass: 'border-[#8C3494]/25',
  },
  UPAY: {
    name: 'Upay',
    color: '#005696',
    hoverColor: '#004578',
    bgSoft: 'rgba(0, 86, 150, 0.08)',
    textClass: 'text-[#0A74C4]',
    borderClass: 'border-[#005696]/25',
  },
  CELLFIN: {
    name: 'Cellfin',
    color: '#00843D',
    hoverColor: '#006C32',
    bgSoft: 'rgba(0, 132, 61, 0.08)',
    textClass: 'text-[#0AA852]',
    borderClass: 'border-[#00843D]/25',
  },
};
