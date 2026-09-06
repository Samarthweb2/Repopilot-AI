import React from 'react'

interface RepoPilotLogoProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  variant?: 'yellow' | 'lime' | 'dark' | 'white'
  textColor?: string
  text?: string
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
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }}
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

/**
 * RepoPilot Logo: Vertical Stack (Hexagon UP, RepoPilot DOWN)
 * Features the signature handwritten / brush script typography from the inspirational image.
 */
export const RepoPilotLogo: React.FC<RepoPilotLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  variant = 'yellow',
  textColor,
  text = 'RepoPilot',
}) => {
  const colorMap = {
    yellow: '#FFE600', // Vibrant Electric Yellow
    lime: '#D2FE22',   // Signature Lime-Yellow
    dark: '#031728',   // Deep Navy
    white: '#FFFFFF',  // Pure White
  }

  const emblemColor = colorMap[variant] || colorMap.yellow
  const textFillColor = textColor || (variant === 'dark' ? '#031728' : variant === 'white' ? '#FFFFFF' : '#E5C800')

  const dimensions = {
    xs: { iconSize: 20, fontSize: 'text-[11px]', gap: 'gap-0', flourishW: 42 },
    sm: { iconSize: 24, fontSize: 'text-xs', gap: 'gap-0', flourishW: 50 },
    md: { iconSize: 32, fontSize: 'text-sm sm:text-base', gap: 'gap-0.5', flourishW: 65 },
    lg: { iconSize: 46, fontSize: 'text-lg sm:text-xl', gap: 'gap-1', flourishW: 85 },
    xl: { iconSize: 64, fontSize: 'text-2xl sm:text-3xl', gap: 'gap-1.5', flourishW: 110 },
  }[size]

  return (
    <div
      className={`inline-flex flex-col items-center justify-center select-none group cursor-pointer ${dimensions.gap} ${className}`}
    >
      {/* 1. Hexagon Logo UP */}
      <div className="relative flex items-center justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        <HexagonREmblem size={dimensions.iconSize} color={emblemColor} />
      </div>

      {/* 2. RepoPilot Text DOWN in authentic handwritten script style */}
      {showText && (
        <div className="relative flex flex-col items-center justify-center leading-none">
          <span
            className={`font-['Caveat',cursive] font-bold tracking-tight text-center ${dimensions.fontSize}`}
            style={{
              color: textFillColor,
              textShadow: '0 0.5px 1px rgba(0,0,0,0.25)',
              transform: 'rotate(-1.5deg)',
              letterSpacing: '-0.01em',
            }}
          >
            {text}
          </span>
          {/* Subtle signature brush flourish stroke underneath */}
          <svg
            width={dimensions.flourishW}
            height="5"
            viewBox="0 0 100 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="opacity-70 -mt-0.5"
          >
            <path
              d="M 5 4 Q 50 7 95 2"
              stroke={emblemColor}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  )
}

export default RepoPilotLogo
