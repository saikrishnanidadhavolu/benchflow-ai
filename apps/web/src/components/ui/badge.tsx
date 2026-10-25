import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      slate: 'bg-slate-100 text-slate-700',
      blue: 'bg-brand-50 text-brand-700',
      green: 'bg-emerald-50 text-emerald-700',
      amber: 'bg-amber-50 text-amber-800',
      red: 'bg-red-50 text-red-700',
      purple: 'bg-violet-50 text-violet-700',
    },
  },
  defaultVariants: { tone: 'slate' },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const STATUS_TONE: Record<string, VariantProps<typeof badgeVariants>['tone']> = {
  active: 'green',
  needs_review: 'amber',
  closed: 'slate',
  expired: 'red',
  duplicate: 'purple',
};
