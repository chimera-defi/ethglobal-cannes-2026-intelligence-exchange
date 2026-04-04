export function formatUsd(value: number | string) {
  const amount = typeof value === 'number' ? value : Number(value);

  if (Number.isNaN(amount)) {
    return '$0';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatShortDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatMilestoneLabel(value: string) {
  const labels: Record<string, string> = {
    brief: 'Brief',
    tasks: 'Task Plan',
    scaffold: 'Scaffold',
    review: 'Review',
  };

  return labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatStatusLabel(value: string) {
  const labels: Record<string, string> = {
    queued: 'Queued',
    claimed: 'Claimed',
    running: 'Running',
    submitted: 'Submitted',
    accepted: 'Accepted',
    rejected: 'Rejected',
    rework: 'Needs Rework',
    funded: 'Funded',
    unfunded: 'Unfunded',
    cancelled: 'Cancelled',
    live: 'Live',
    complete: 'Complete',
  };

  return labels[value] ?? value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function truncateMiddle(value: string, start = 8, end = 6) {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}
