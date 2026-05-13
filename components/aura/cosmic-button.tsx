'use client'

import { forwardRef, ElementType, ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'
import { CosmicSpinner } from './cosmic-spinner'

type CosmicButtonProps<T extends ElementType = 'button'> = {
  as?: T | 'span'
  variant?: 'outline' | 'filled'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
} & Omit<ComponentPropsWithoutRef<'button'>, 'as'>

export const CosmicButton = forwardRef<HTMLButtonElement, CosmicButtonProps>(
  ({ className, variant = 'outline', size = 'md', loading, children, disabled, as, ...props }, ref) => {
    const sizeClasses = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-12 py-3.5 text-lg tracking-[0.1em]'
    }

    const baseClass = variant === 'filled' ? 'cosmic-btn-filled' : 'cosmic-btn'
    const classes = cn(
      baseClass,
      sizeClasses[size],
      'font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2',
      className
    )

    if (as === 'span') {
      return (
        <span className={classes} {...(props as any)}>
          {loading && <CosmicSpinner size={18} />}
          {children}
        </span>
      )
    }

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading && <CosmicSpinner size={18} />}
        {children}
      </button>
    )
  }
)

CosmicButton.displayName = 'CosmicButton'
