'use client'

interface CosmicSpinnerProps {
  size?: number
  className?: string
}

export function CosmicSpinner({ size = 24, className = '' }: CosmicSpinnerProps) {
  return (
    <svg
      className={`cosmic-spinner ${className}`}
      width={size}
      height={size}
      viewBox="0 0 50 50"
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth="4"
        strokeDasharray="80 40"
      />
    </svg>
  )
}
