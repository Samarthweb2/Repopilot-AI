import React, { useState } from 'react'
import { Check, Copy, FileCode, Tag } from 'lucide-react'

interface CodeViewerProps {
  filePath: string
  code: string
  startLine?: number
  endLine?: number
  highlightStart?: number
  highlightEnd?: number
  symbolName?: string | null
  claim?: string | null
  className?: string
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  filePath,
  code,
  startLine = 1,
  endLine,
  highlightStart,
  highlightEnd,
  symbolName,
  claim,
  className = '',
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split('\n')

  return (
    <div
      className={`rounded-2xl border border-slate-300 bg-[#031728] text-white overflow-hidden shadow-xl transition-all ${className}`}
    >
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#051f36] border-b border-slate-700/60 text-xs">
        <div className="flex items-center gap-2 overflow-hidden text-slate-200 font-mono">
          <FileCode className="w-4 h-4 text-[#D2FE22] shrink-0" />
          <span className="font-bold text-white truncate">{filePath}</span>
          <span className="text-slate-400 font-mono">
            :{startLine}
            {endLine ? `-${endLine}` : ''}
          </span>
          {symbolName && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D2FE22]/20 text-[#D2FE22] border border-[#D2FE22]/40 text-[10px] font-mono font-bold">
              <Tag className="w-3 h-3" />
              {symbolName}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors shrink-0 font-semibold cursor-pointer border border-slate-700"
          title="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#D2FE22]" />
              <span className="text-[#D2FE22]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Claim callout banner if paired */}
      {claim && (
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs text-slate-200 flex items-start gap-2">
          <span className="font-bold text-[#D2FE22] uppercase tracking-wider shrink-0 text-[11px]">
            Claim:
          </span>
          <span className="italic leading-relaxed">{claim}</span>
        </div>
      )}

      {/* Source lines with Nebius Lime highlighting */}
      <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed max-h-[380px] overflow-y-auto bg-[#031728]">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              const currentLineNumber = startLine + idx
              const isHighlighted =
                highlightStart && highlightEnd
                  ? currentLineNumber >= highlightStart && currentLineNumber <= highlightEnd
                  : false

              return (
                <tr
                  key={idx}
                  className={`transition-colors ${
                    isHighlighted
                      ? 'bg-[#D2FE22]/15 text-[#D2FE22] font-semibold border-l-2 border-[#D2FE22]'
                      : 'hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  <td className="w-12 pr-4 text-right select-none text-slate-500 font-mono text-[11px]">
                    {currentLineNumber}
                  </td>
                  <td className="whitespace-pre font-mono py-0.5">
                    {line || ' '}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
