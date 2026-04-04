import { formatStatusLabel } from '../lib/formatters';

const toneByStatus: Record<string, string> = {
  queued: 'badge-queued',
  claimed: 'badge-claimed',
  running: 'badge-running',
  submitted: 'badge-submitted',
  accepted: 'badge-accepted',
  rejected: 'badge-rejected',
  rework: 'badge-rework',
  funded: 'badge-funded',
  unfunded: 'badge-unfunded',
  cancelled: 'badge-cancelled',
  live: 'badge-claimed',
  complete: 'badge-accepted',
};

export function StatusBadge({
  status,
  label,
  className = '',
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = toneByStatus[status] ?? '';

  return (
    <span className={['badge', tone, className].filter(Boolean).join(' ')}>
      {label ?? formatStatusLabel(status)}
    </span>
  );
}
