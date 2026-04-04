import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-slate-800 text-slate-300',
        queued: 'bg-emerald-950 text-emerald-400',
        claimed: 'bg-blue-950 text-blue-400',
        submitted: 'bg-blue-900 text-blue-300',
        accepted: 'bg-slate-800 text-slate-300',
        rejected: 'bg-red-900 text-red-300',
        rework: 'bg-red-900 text-red-300',
        funded: 'bg-slate-800 text-slate-300',
        unfunded: 'bg-gray-800 text-gray-400',
        created: 'bg-gray-800 text-gray-300',
        settled: 'bg-slate-800 text-slate-300',
        success: 'bg-emerald-950 text-emerald-400',
        warning: 'bg-amber-950 text-amber-400',
        error: 'bg-red-900 text-red-300',
        info: 'bg-blue-950 text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
