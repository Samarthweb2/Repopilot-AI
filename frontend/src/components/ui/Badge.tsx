import React from 'react'
import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'accent'
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const base =
    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors'

  const variants = {
    default: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
    secondary: 'bg-slate-800 text-slate-300 border border-slate-700/60',
    success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    destructive: 'bg-red-500/15 text-red-300 border border-red-500/30',
    outline: 'border border-slate-700 text-slate-400',
    accent: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
  }

  return (
    <span className={cn(base, variants[variant], className)} {...props}>
      {children}
    </span>
  )
}
