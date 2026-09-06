import React from 'react'

interface RepoPilotLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'badge' | 'mark-only' | 'text-only' | 'plain'
  showTag?: boolean
}

export const RepoPilotLogo: React.FC<RepoPilotLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'badge',
  showTag = false,
}) => {
  // Size mapping
  const sizeClasses = {
    sm: {
      badge: 'px-2.5 py-1 rounded-lg gap-1.5',
      icon: 'w-4 h-4',
      text: 'text-xs tracking-tight font-black',
      tag: 'text-[8px] px-1 py-0.2',
    },
    md: {
      badge: 'px-3.5 py-1.5 rounded-xl gap-2',
      icon: 'w-5 h-5',
      text: 'text-sm sm:text-[15px] tracking-tight font-black',
      tag: 'text-[9px] px-1.5 py-0.5',
    },
    lg: {
      badge: 'px-5 py-2.5 rounded-2xl gap-2.5',
      icon: 'w-7 h-7',
      text: 'text-lg sm:text-xl tracking-tight font-black',
      tag: 'text-[10px] px-2 py-0.5',
    },
  }[size]

  // Bespoke Geometric RepoPilot Brand Mark:
  // Combines Code Branch + Supersonic Pilot Stealth Delta + AST Node
  const BrandIcon = ({ iconClass = 'w-5 h-5' }: { iconClass?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${iconClass} shrink-0`}
      aria-label="RepoPilot Logomark"
    >
      {/* Left Code Branch Bracket */}
      <path
        d="M 8.5 4.5 L 3.5 12 L 8.5 19.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Forward Pilot Delta Chevron */}
      <path
        d="M 10 7.5 L 17 12 L 10 16.5 L 12.5 12 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* AST Core Node Point */}
      <circle cx="19.5" cy="12" r="1.75" fill="currentColor" />
    </svg>
  )

  if (variant === 'mark-only') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <BrandIcon iconClass={sizeClasses.icon} />
      </div>
    )
  }

  if (variant === 'text-only') {
    return (
      <span
        className={`font-['Space_Grotesk',sans-serif] font-black tracking-tighter text-[#031728] ${sizeClasses.text} ${className}`}
      >
        REPOPILOT
      </span>
    )
  }

  if (variant === 'plain') {
    return (
      <div className={`inline-flex items-center gap-2 text-[#031728] ${className}`}>
        <div className="w-7 h-7 rounded-lg bg-[#D2FE22] text-[#031728] flex items-center justify-center shadow-xs">
          <BrandIcon iconClass="w-4 h-4" />
        </div>
        <span className={`font-['Space_Grotesk',sans-serif] font-black tracking-tight ${sizeClasses.text}`}>
          REPOPILOT
        </span>
        {showTag && (
          <span className={`rounded font-bold bg-[#031728] text-[#D2FE22] ${sizeClasses.tag}`}>
            AI
          </span>
        )}
      </div>
    )
  }

  // Default: Signature Nebius Lime Pill Badge
  return (
    <div
      className={`repopilot-logo-badge inline-flex items-center select-none bg-[#D2FE22] text-[#031728] border border-black/10 shadow-xs hover:shadow-[0_0_16px_rgba(210,254,34,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer ${sizeClasses.badge} ${className}`}
    >
      <BrandIcon iconClass={sizeClasses.icon} />
      <span className={`font-['Space_Grotesk',sans-serif] font-black tracking-tight uppercase leading-none ${sizeClasses.text}`}>
        REPOPILOT
      </span>
      {showTag && (
        <span className={`rounded-full font-bold bg-black/15 text-[#031728] ${sizeClasses.tag}`}>
          AI
        </span>
      )}
    </div>
  )
}
