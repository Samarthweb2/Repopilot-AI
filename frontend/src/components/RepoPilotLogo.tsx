import React from 'react'

interface RepoPilotLogoProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  variant?: 'yellow' | 'lime' | 'dark' | 'white'
  textColor?: string
}

/**
 * Precision Hexagon 'R' Logo Emblem (Vector SVG)
 * Accurately modeled after the authentic Hexagon 'R' emblem in signature yellow.
 */
export const HexagonREmblem: React.FC<{
  className?: string
  size?: number | string
  color?: string
  strokeColor?: string
}> = ({
  className = '',
  size = 32,
  color = '#FFE600', // Signature vibrant yellow
  strokeColor,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-200 ${className}`}
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))' }}
    >
      {/* Precision Geometric Hexagon with aerodynamic negative-space R cutout */}
      <path
        d="M 31.2 14.0
           L 68.2 14.0
           L 88.5 45.1
           L 71.5 74.0
           L 53.5 74.0
           L 49.0 63.8
           C 54.5 63.0 61.5 58.5 65.5 51.5
           C 69.2 45.0 69.0 35.5 63.5 28.5
           C 57.5 21.0 48.0 21.0 42.5 28.0
           L 21.5 63.8
           L 11.5 45.1
           L 31.2 14.0 Z"
        fill={color}
        stroke={strokeColor || 'none'}
        strokeWidth={strokeColor ? 1.5 : 0}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const RepoPilotLogo: React.FC<RepoPilotLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  variant = 'yellow',
  textColor,
}) => {
  const colorMap = {
    yellow: '#FFE600', // Vibrant Electric Yellow
    lime: '#D2FE22',   // Signature Lime-Yellow
    dark: '#031728',   // Deep Navy
    white: '#FFFFFF',  // Pure White
  }

  const emblemColor = colorMap[variant] || colorMap.yellow

  const dimensions = {
    xs: { iconSize: 20, fontSize: 'text-xs', gap: 'gap-1.5' },
    sm: { iconSize: 24, fontSize: 'text-sm', gap: 'gap-2' },
    md: { iconSize: 32, fontSize: 'text-base sm:text-lg', gap: 'gap-2.5' },
    lg: { iconSize: 40, fontSize: 'text-xl sm:text-2xl', gap: 'gap-3' },
    xl: { iconSize: 52, fontSize: 'text-3xl sm:text-4xl', gap: 'gap-3.5' },
  }[size]

  return (
    <div
      className={`inline-flex items-center select-none group cursor-pointer ${dimensions.gap} ${className}`}
    >
      {/* The Yellow Hexagon 'R' Emblem */}
      <div className="relative flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <HexagonREmblem size={dimensions.iconSize} color={emblemColor} />
      </div>

      {/* Accompanying Wordmark */}
      {showText && (
        <div className="flex items-center leading-none">
          <span
            className={`font-['Space_Grotesk',sans-serif] font-black tracking-tight uppercase ${dimensions.fontSize} ${
              textColor || 'text-[#031728]'
            }`}
            style={{ letterSpacing: '-0.03em' }}
          >
            Repo<span className="text-[#031728]">Pilot</span>
          </span>
        </div>
      )}
    </div>
  )
}

export default RepoPilotLogo
