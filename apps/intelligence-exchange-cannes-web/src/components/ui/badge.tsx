import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-800 text-gray-300',
        queued: 'bg-yellow-900 text-yellow-200',
        claimed: 'bg-blue-900 text-blue-200',
        submitted: 'bg-purple-900 text-purple-200',
        accepted: 'bg-green-900 text-green-200',
        rejected: 'bg-red-900 text-red-200',
        rework: 'bg-red-900 text-red-200',
        funded: 'bg-emerald-900 text-emerald-200',
        unfunded: 'bg-gray-800 text-gray-400',
        created: 'bg-gray-800 text-gray-300',
        settled: 'bg-teal-900 text-teal-200',
        success: 'bg-green-900 text-green-200',
        warning: 'bg-yellow-900 text-yellow-200',
        error: 'bg-red-900 text-red-200',
        info: 'bg-blue-900 text-blue-200',
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
