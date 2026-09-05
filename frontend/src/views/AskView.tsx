import React, { useState, useRef } from 'react'
import { streamAskRepo } from '../lib/api'
import { AgentStep, EvidenceCitation, QueryResponse, RepoSummary, SSEStreamEvent } from '../types'
import { CodeViewer } from '../components/CodeViewer'
import { getRepoDisplayName, truncateHash } from '../lib/utils'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  FileCode,
  FolderSearch,
  GitBranch,
  History,
  Layers,
  Lightbulb,
  ListTree,
  Loader2,
  Search,
  Send,
  Sparkles,
  StopCircle,
  Terminal,
  Zap,
} from 'lucide-react'

interface AskViewProps {
  repos: RepoSummary[]
  activeRepoId: string | null
  onSelectRepo: (repoId: string) => void
}

const EXAMPLE_QUERIES = [
  'How does Session manage cookie persistence and session hooks?',
  'Where is HTTP basic and digest authentication implemented?',
  'What parameters does the request() dispatch method accept?',
  'Trace all callers and usages of the send() method.',
]

export const AskView: React.FC<AskViewProps> = ({
  repos,
  activeRepoId,
}) => {
  const [query, setQuery] = useState('')
  const [modelProvider, setModelProvider] = useState<'gemini' | 'mock' | 'openai'>('gemini')
  const [modelName, setModelName] = useState('gemini-3.7-flash')
  const [maxSteps, setMaxSteps] = useState(6)

  // Investigation state
  const [isInvestigating, setIsInvestigating] = useState(false)
  const [currentThought, setCurrentThought] = useState<string | null>(null)
  const [liveSteps, setLiveSteps] = useState<AgentStep[]>([])
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({})
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null)
  const [evidenceCitations, setEvidenceCitations] = useState<EvidenceCitation[]>([])
  const [synthesizingMessage, setSynthesizingMessage] = useState<string | null>(null)
  const [investigationError, setInvestigationError] = useState<string | null>(null)

  // Highlighting & Active Evidence selection
  const [activeEvidenceKey, setActiveEvidenceKey] = useState<string | null>(null)

  // Abort controller for stopping live streams
  const abortControllerRef = useRef<AbortController | null>(null)
  const evidencePanelRef = useRef<HTMLDivElement>(null)
  const answerSectionRef = useRef<HTMLDivElement>(null)

  const activeRepo = repos.find((r) => r.repo_id === activeRepoId)

  // Toggle step expansion
  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }))
  }

  // Stop investigation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsInvestigating(false)
    setSynthesizingMessage(null)
  }

  // Handle citation click -> Scroll & highlight matching evidence card
  const handleCitationClick = (citation: EvidenceCitation, idx: number) => {
    const key = `${citation.file_path}:${citation.start_line}-${citation.end_line}`
    setActiveEvidenceKey(key)

    // Scroll evidence card into view
    const targetEl = document.getElementById(`evidence-card-${idx}`)
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!query.trim() || !activeRepoId) return

    setIsInvestigating(true)
    setInvestigationError(null)
    setLiveSteps([])
    setExpandedSteps({})
    setCurrentThought(null)
    setFinalAnswer(null)
    setEvidenceCitations([])
    setSynthesizingMessage(null)
    setActiveEvidenceKey(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      await streamAskRepo(
        activeRepoId,
        query.trim(),
        maxSteps,
        modelProvider,
        modelName,
        {
          onEvent: (sseEvent: SSEStreamEvent) => {
            const { event, data } = sseEvent

            if (event === 'step_start') {
              setCurrentThought(data.thought || `Calling tool ${data.tool_name}...`)
              setLiveSteps((prev) => {
                const existing = prev.find((s) => s.step_number === data.step_number)
                if (existing) return prev
                return [
                  ...prev,
                  {
                    step_number: data.step_number,
                    thought: data.thought,
                    tool_name: data.tool_name,
                    tool_input: data.tool_input,
                    observation: 'Executing tool in codebase...',
                  },
                ]
              })
              setExpandedSteps((prev) => ({ ...prev, [data.step_number]: true }))
            } else if (event === 'step_complete') {
              setCurrentThought(null)
              setLiveSteps((prev) => {
                const idx = prev.findIndex((s) => s.step_number === data.step_number)
                if (idx !== -1) {
                  const copy = [...prev]
                  copy[idx] = data
                  return copy
                }
                return [...prev, data]
              })
            } else if (event === 'synthesizing') {
              setSynthesizingMessage(data.message || 'Synthesizing evidence-backed answer...')
              setCurrentThought(null)
            } else if (event === 'complete') {
              const res = data as QueryResponse
              setFinalAnswer(res.answer)
              setEvidenceCitations(res.evidence || [])
              setLiveSteps(res.steps || [])
              setSynthesizingMessage(null)
              setIsInvestigating(false)
            } else if (event === 'error') {
              setInvestigationError(data.error || 'Investigation halted unexpectedly.')
              setIsInvestigating(false)
            }
          },
          onError: (err) => {
            setInvestigationError(err.message || 'Failed to communicate with agent SSE stream.')
            setIsInvestigating(false)
          },
          onDone: () => {
            setIsInvestigating(false)
            setSynthesizingMessage(null)
          },
        },
        controller.signal
      )
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setInvestigationError(err.message || 'Error occurred while querying repository.')
      }
      setIsInvestigating(false)
    }
  }

  const getToolIcon = (toolName?: string | null) => {
    switch (toolName) {
      case 'search_code':
        return <Search className="w-4 h-4 text-[#D2FE22]" />
      case 'lookup_symbol':
        return <Code2 className="w-4 h-4 text-[#D2FE22]" />
      case 'read_file_slice':
        return <FileCode className="w-4 h-4 text-[#D2FE22]" />
      case 'get_references':
        return <ListTree className="w-4 h-4 text-[#D2FE22]" />
      case 'git_blame':
        return <History className="w-4 h-4 text-[#D2FE22]" />
      case 'grep':
        return <FolderSearch className="w-4 h-4 text-[#D2FE22]" />
      case 'list_directory':
        return <Layers className="w-4 h-4 text-[#D2FE22]" />
      default:
        return <Terminal className="w-4 h-4 text-[#D2FE22]" />
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Top Header & Active Repo context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-nebius text-[#031728] tracking-tight flex items-center gap-3">
            <Bot className="w-7 h-7 text-[#031728]" />
            Ask RepoPilot Assistant
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Autonomous multi-step ReAct agent reads source files, verifies call graphs, and pairs claims with exact citations.
          </p>
        </div>

        {/* Active Repo Pill */}
        {activeRepo && (
          <div className="flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">
            <div className="w-7 h-7 rounded-full bg-[#D2FE22] flex items-center justify-center text-black font-bold">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#031728]">
                {getRepoDisplayName(activeRepo.url)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span className="flex items-center gap-1 font-mono">
                  <GitBranch className="w-3 h-3" />
                  {activeRepo.branch}
                </span>
                <span>•</span>
                <span className="font-mono">{truncateHash(activeRepo.commit_hash)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Left side (Chat & Trajectory) | Right side (Code Evidence Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Input, Live Steps, Final Synthesized Answer (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Query Formulation Card */}
          <div className="nebius-card p-6 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Enter Codebase Query</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Supports natural language and technical requests
                  </span>
                </label>
                <textarea
                  id="ask-query-input"
                  rows={3}
                  placeholder="e.g. How does Session manage cookie persistence and connection pooling in requests?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm text-[#031728] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D2FE22] focus:border-transparent resize-none font-sans leading-relaxed transition-all shadow-inner"
                />
              </div>

              {/* Model & Config settings */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Provider picker */}
                  <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5 font-semibold text-slate-700">
                    <Cpu className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      id="provider-select"
                      value={modelProvider}
                      onChange={(e) => {
                        const val = e.target.value as any
                        setModelProvider(val)
                        if (val === 'gemini') setModelName('gemini-3.7-flash')
                        if (val === 'mock') setModelName('mock-fast')
                      }}
                      className="bg-transparent text-[#031728] outline-none text-xs cursor-pointer font-semibold"
                    >
                      <option value="gemini">Google Gemini (3.7 Flash)</option>
                      <option value="mock">Mock Provider (Offline fast)</option>
                    </select>
                  </div>

                  {/* Max steps selector */}
                  <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700">
                    <span>Steps:</span>
                    <select
                      id="max-steps-select"
                      value={maxSteps}
                      onChange={(e) => setMaxSteps(Number(e.target.value))}
                      className="bg-transparent text-[#031728] outline-none text-xs cursor-pointer font-mono font-bold"
                    >
                      <option value={3}>3</option>
                      <option value={6}>6 (Default)</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                    </select>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {isInvestigating ? (
                    <button
                      id="stop-investigation-btn"
                      type="button"
                      onClick={handleStop}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      id="ask-submit-btn"
                      type="submit"
                      disabled={!query.trim() || !activeRepoId}
                      className="nebius-btn-primary py-2.5 px-6 text-xs font-bold cursor-pointer"
                    >
                      <span>Investigate</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* Suggested Queries */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Suggested Investigations:
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((eq, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setQuery(eq)}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition-colors text-left font-medium cursor-pointer"
                  >
                    {eq}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Investigation Error */}
          {investigationError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-sm flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Investigation Error</div>
                <div className="text-xs mt-1">{investigationError}</div>
              </div>
            </div>
          )}

          {/* Live Progress Status */}
          {(isInvestigating || synthesizingMessage) && (
            <div className="p-5 rounded-2xl bg-[#031728] text-white flex items-center justify-between gap-4 shadow-xl animate-fadeIn">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#D2FE22] animate-spin" />
                <div>
                  <div className="text-sm font-bold">
                    {synthesizingMessage || 'Agent is actively inspecting codebase...'}
                  </div>
                  {currentThought && (
                    <div className="text-xs text-slate-300 font-mono italic truncate max-w-md mt-0.5">
                      "{currentThought}"
                    </div>
                  )}
                </div>
              </div>
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-[#D2FE22] text-black">
                LIVE SSE
              </span>
            </div>
          )}

          {/* Live Step Accordion Trajectory */}
          {liveSteps.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
                <span>Investigation Trajectory</span>
                <span>{liveSteps.length} Step{liveSteps.length > 1 ? 's' : ''}</span>
              </div>

              <div className="space-y-2.5">
                {liveSteps.map((step) => {
                  const isExpanded = expandedSteps[step.step_number] ?? false
                  const isExecuting =
                    isInvestigating &&
                    step.step_number === liveSteps.length &&
                    step.observation === 'Executing tool in codebase...'

                  return (
                    <div
                      key={step.step_number}
                      className="nebius-card overflow-hidden border-slate-200"
                    >
                      {/* Step Header */}
                      <button
                        type="button"
                        onClick={() => toggleStep(step.step_number)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="w-6 h-6 rounded-full bg-[#031728] text-white text-xs font-mono font-bold flex items-center justify-center shrink-0">
                            {step.step_number}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                            {getToolIcon(step.tool_name)}
                            <span className="font-mono text-xs font-bold text-[#031728]">
                              {step.tool_name || 'thought'}
                            </span>
                          </div>

                          {step.thought && (
                            <span className="text-xs text-slate-600 truncate max-w-[280px] italic hidden sm:inline">
                              "{step.thought}"
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isExecuting ? (
                            <Loader2 className="w-4 h-4 text-slate-700 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          )}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Content: Input Args & Observation */}
                      {isExpanded && (
                        <div className="p-4 pt-2 space-y-3 border-t border-slate-100 bg-slate-50 text-xs">
                          {step.thought && (
                            <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 text-xs leading-relaxed">
                              <span className="font-bold text-[#031728] mr-1.5">Reasoning:</span>
                              {step.thought}
                            </div>
                          )}

                          {step.tool_input && Object.keys(step.tool_input).length > 0 && (
                            <div>
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Tool Parameters
                              </div>
                              <pre className="p-3 rounded-xl bg-[#031728] text-[#D2FE22] font-mono text-[11px] overflow-x-auto">
                                {JSON.stringify(step.tool_input, null, 2)}
                              </pre>
                            </div>
                          )}

                          <div>
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Observation Result
                            </div>
                            <pre className="p-3 rounded-xl bg-[#031728] text-slate-200 font-mono text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                              {step.observation}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Synthesized Final Answer Card */}
          {finalAnswer && (
            <div
              ref={answerSectionRef}
              className="nebius-card p-6 sm:p-8 space-y-6 border-slate-300 shadow-xl animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#031728]" />
                  <h3 className="text-xl font-bold font-nebius text-[#031728]">
                    Synthesized Explanation
                  </h3>
                </div>
                <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-[#D2FE22] text-black">
                  VERIFIED EVIDENCE
                </span>
              </div>

              {/* Answer Markdown Body */}
              <div className="text-sm text-slate-800 leading-relaxed font-sans space-y-4 whitespace-pre-wrap">
                {finalAnswer}
              </div>

              {/* Per-Claim Citation Chips */}
              {evidenceCitations.length > 0 && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-[#031728] uppercase tracking-wider flex items-center gap-1.5">
                    <FileCode className="w-4 h-4" />
                    Verifiable Code Citations ({evidenceCitations.length})
                  </div>
                  <p className="text-xs text-slate-500">
                    Click any citation chip below to highlight the exact code lines in the evidence panel:
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {evidenceCitations.map((citation, idx) => {
                      const key = `${citation.file_path}:${citation.start_line}-${citation.end_line}`
                      const isSelected = activeEvidenceKey === key

                      return (
                        <button
                          key={idx}
                          id={`citation-badge-${idx}`}
                          type="button"
                          onClick={() => handleCitationClick(citation, idx)}
                          className={`citation-link text-xs font-mono px-3 py-1.5 rounded-full border transition-all flex items-center gap-2 cursor-pointer font-bold ${
                            isSelected
                              ? 'bg-[#031728] text-white border-[#031728] shadow-md'
                              : 'bg-slate-100 hover:bg-[#D2FE22]/20 text-[#031728] border-slate-300 hover:border-[#D2FE22]'
                          }`}
                        >
                          <span>[{idx + 1}]</span>
                          <span className="truncate max-w-[180px]">{citation.file_path}</span>
                          <span className="opacity-75">
                            :{citation.start_line}-{citation.end_line}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Code Evidence Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4" ref={evidencePanelRef}>
          <div className="sticky top-20 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-[#031728] uppercase tracking-wider flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#031728]" />
                Code Evidence Panel
              </h3>
              <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
                {evidenceCitations.length} Cited
              </span>
            </div>

            {evidenceCitations.length === 0 ? (
              /* Empty Evidence State */
              <div className="nebius-card p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                  <Terminal className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-[#031728]">No Evidence Citations Yet</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  When the agent synthesizes an explanation, exact source code snippets verified from disk will display here with line numbers.
                </p>
              </div>
            ) : (
              /* Rendered Evidence Cards */
              <div className="space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                {evidenceCitations.map((cit, idx) => {
                  const key = `${cit.file_path}:${cit.start_line}-${cit.end_line}`
                  const isSelected = activeEvidenceKey === key

                  return (
                    <div
                      key={idx}
                      id={`evidence-card-${idx}`}
                      onClick={() => {
                        setActiveEvidenceKey(key)
                      }}
                      className={`transition-all rounded-xl cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-[#031728] shadow-xl scale-[1.01]'
                          : 'hover:border-slate-400'
                      }`}
                    >
                      <CodeViewer
                        filePath={cit.file_path}
                        code={cit.code_snippet}
                        startLine={cit.start_line}
                        endLine={cit.end_line}
                        highlightStart={cit.start_line}
                        highlightEnd={cit.end_line}
                        symbolName={cit.symbol_name}
                        claim={cit.claim || cit.relevance_explanation}
                        className={isSelected ? 'border-[#031728]' : ''}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
