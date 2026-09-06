import React, { useState, useEffect } from 'react'
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FileCode,
  FolderGit2,
  GitBranch,
  Layers,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

interface LandingPageViewProps {
  onNavigateToConnect: () => void
  onNavigateToDashboard: () => void
  onNavigateToAsk: () => void
  onRegister?: () => void
  isAuthenticated?: boolean
  repoCount: number
}

const FAQS = [
  {
    question: 'Can I use RepoPilot for large enterprise production codebases?',
    answer:
      'Yes. RepoPilot is engineered specifically for deep codebase exploration. It filters out non-code assets, lockfiles, and minified binaries, parsing only genuine source code into Tree-sitter Abstract Syntax Tree (AST) symbol nodes and ChromaDB vector embeddings for sub-second semantic retrieval.',
  },
  {
    question: 'How does commit-hash caching prevent redundant vector embeddings?',
    answer:
      'When you trigger an index on any repository, RepoPilot calculates the latest Git commit SHA. If the commit hash matches the stored index record, RepoPilot returns a cache-hit status (SKIPPED) instantly, avoiding duplicate embedding generation and saving cloud API costs.',
  },
  {
    question: 'Which programming languages does the AST parser support?',
    answer:
      'RepoPilot currently includes native Tree-sitter parsers for Python, JavaScript, and TypeScript, extracting functions, classes, methods, docstrings, parameters, and parent enclosing scopes. Non-code text files (such as READMEs and markdown documentation) are automatically chunked into structured sections.',
  },
  {
    question: 'How are citations verified from source files on disk?',
    answer:
      'Unlike standard RAG models that guess source lines from hallucinated memories, RepoPilot requires the autonomous ReAct agent to use the read_file_slice tool to inspect actual source code directly on disk before synthesizing claims. Each claim in the final answer is linked to verified file paths and exact start/end line bounds.',
  },
  {
    question: 'How secure is my code and where does my data go?',
    answer:
      'RepoPilot operates with strict security controls: path-traversal guards prevent reading any files outside the repository root, and all test suites and mock providers run 100% locally and offline without transmitting code to external services unless you choose to configure cloud providers like Gemini or OpenAI.',
  },
  {
    question: 'Can I run RepoPilot fully offline without cloud API keys?',
    answer:
      'Yes. RepoPilot features built-in Mock and local heuristic providers for both LLM reasoning and code embeddings. All 38 backend tests execute completely offline without requiring any third-party credentials.',
  },
]

const HEADLINE_LINE1 = ['Ask', 'your', 'codebase', 'anything.']
const HEADLINE_LINE2 = ['Get', 'answers', 'you', 'can', 'verify.']
const TOTAL_WORDS = [...HEADLINE_LINE1, ...HEADLINE_LINE2]

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onNavigateToConnect,
  onNavigateToDashboard,
  onNavigateToAsk,
  onRegister,
  isAuthenticated,
  repoCount,
}) => {
  const [copiedCode, setCopiedCode] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  // Typewriter animation state (word-by-word at ~90ms interval)
  const [typedWordCount, setTypedWordCount] = useState(0)
  const [isTypingComplete, setIsTypingComplete] = useState(false)

  useEffect(() => {
    if (typedWordCount < TOTAL_WORDS.length) {
      const timer = setTimeout(() => {
        setTypedWordCount((prev) => prev + 1)
      }, 90)
      return () => clearTimeout(timer)
    } else {
      const completeTimer = setTimeout(() => {
        setIsTypingComplete(true)
      }, 100)
      return () => clearTimeout(completeTimer)
    }
  }, [typedWordCount])

  const line1VisibleWords = HEADLINE_LINE1.slice(0, Math.min(typedWordCount, HEADLINE_LINE1.length))
  const line2VisibleWords =
    typedWordCount > HEADLINE_LINE1.length
      ? HEADLINE_LINE2.slice(0, typedWordCount - HEADLINE_LINE1.length)
      : []

  const pythonApiSnippet = `from repopilot import RepoPilotClient

# Connect to the deployed or local RepoPilot engine
client = RepoPilotClient(base_url="http://localhost:8000")

# Ingest and index any GitHub repository
repo = client.repos.connect("https://github.com/psf/requests.git", branch="main")
indexing = repo.index()
print(f"Indexed {indexing.chunks_count} AST chunks into ChromaDB")

# Execute multi-step ReAct autonomous investigation with live streaming
investigation = repo.ask(
    query="How does Session handle cookie persistence and connection pooling?",
    model_provider="gemini",
    model_name="gemini-3.7-flash"
)

for step in investigation.stream_steps():
    print(f"[{step.tool_name}] -> {step.thought}")

# Synthesized answer with verifiable per-claim citations
print(investigation.final_answer)
for citation in investigation.evidence:
    print(f"[{citation.file_path}:{citation.start_line}-{citation.end_line}] {citation.claim}")`

  const handleCopyCode = () => {
    navigator.clipboard.writeText(pythonApiSnippet)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx)
  }

  return (
    <div className="w-full bg-[#f8fafc] text-[#031728] selection:bg-[#D2FE22] selection:text-black">
      {/* 1. Hero Section: Full-bleed Lime Banner with fixed 460-500px height */}
      <section className="nebius-hero-container text-[#031728] relative overflow-hidden h-[460px] sm:h-[480px] lg:h-[500px] flex items-center border-b border-black/10">
        {/* Subtle grid texture overlay: 40px intervals */}
        <div className="nebius-hero-grid" />

        {/* Hero Artwork: Anchored directly flush to right wall (right-0) and bottom wall (bottom-0) */}
        <div className="absolute bottom-0 right-0 -right-[1px] h-full flex items-end justify-end pointer-events-none z-10 select-none">
          {/* Ambient Halo Glow */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-[420px] lg:w-[500px] h-[420px] lg:h-[500px] bg-white/30 blur-3xl -z-10 pointer-events-none" />

          <img
            src="/hero-developer-cropped.png"
            alt="RepoPilot AI Codebase Intelligence"
            className="h-full max-h-[460px] sm:max-h-[480px] lg:max-h-[500px] w-auto object-contain object-bottom-right block select-none"
          />
        </div>

        {/* Subtle Bottom Edge Gradient Fade (lime to white transition, ~60px tall) */}
        <div className="absolute bottom-0 left-0 right-0 h-14 sm:h-16 bg-gradient-to-b from-transparent to-white pointer-events-none z-20" />

        {/* Left Column Content Container */}
        <div className="max-w-7xl mx-auto w-full h-full relative z-20 flex items-center px-4 sm:px-6 lg:px-8 xl:px-12 pointer-events-none">
          <div className="max-w-xl sm:max-w-2xl space-y-4 sm:space-y-5 py-4 pointer-events-auto">


            {/* Word-by-word typewriter headline in Space Mono font */}
            <div className="space-y-3 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-['Space_Mono',monospace] text-[#031728] tracking-tight leading-snug min-h-[3.2rem] sm:min-h-[3.8rem]">
                {line1VisibleWords.length > 0 && (
                  <span>{line1VisibleWords.join(' ')}</span>
                )}
                {typedWordCount <= HEADLINE_LINE1.length && !isTypingComplete && (
                  <span className="inline-block w-2 sm:w-2.5 h-5 sm:h-6 bg-[#031728] ml-1.5 align-middle animate-cursor-blink" />
                )}

                {typedWordCount > HEADLINE_LINE1.length && (
                  <>
                    <br className="hidden sm:inline" />
                    <span className="sm:hidden"> </span>
                    <span>{line2VisibleWords.join(' ')}</span>
                    {!isTypingComplete && (
                      <span className="inline-block w-2 sm:w-2.5 h-5 sm:h-6 bg-[#031728] ml-1.5 align-middle animate-cursor-blink" />
                    )}
                  </>
                )}
              </h1>

              {/* Subtitle & CTA Buttons: Fade in (~500ms) once typing completes */}
              <div
                className={`space-y-4 transition-all duration-500 ease-out ${
                  isTypingComplete
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2 pointer-events-none'
                }`}
              >
                <p className="text-slate-800/90 text-sm sm:text-base font-normal leading-relaxed max-w-xl">
                  Every claim cited down to the exact line.
                </p>

                {/* Action Buttons: Context-aware for logged-in vs new visitors */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {isAuthenticated ? (
                    <>
                      <button
                        id="hero-btn-launch-dashboard"
                        onClick={onNavigateToDashboard}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold bg-[#031728] text-white hover:bg-[#072440] transition-all shadow-sm cursor-pointer"
                      >
                        <span>Launch Workspace</span>
                        <ArrowRight className="w-4 h-4 text-[#D2FE22]" />
                      </button>
                      <button
                        id="hero-btn-connect-codebase"
                        onClick={onNavigateToConnect}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold bg-[#d2fe22]/90 hover:bg-[#c4f014] text-[#031728] border border-black/15 transition-all shadow-xs cursor-pointer"
                      >
                        <FolderGit2 className="w-3.5 h-3.5 text-[#031728]" />
                        <span>Connect Codebase</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        id="hero-btn-register"
                        onClick={() => {
                          if (onRegister) {
                            onRegister()
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-semibold bg-[#031728] text-white hover:bg-[#072440] transition-all shadow-sm cursor-pointer"
                      >
                        <span>Register now</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#D2FE22]" />
                      </button>
                      <button
                        id="hero-btn-explore"
                        onClick={onNavigateToDashboard}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold bg-[#d2fe22]/90 hover:bg-[#c4f014] text-[#031728] border border-black/15 transition-all shadow-xs cursor-pointer"
                      >
                        <span>Explore Repositories</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* 3. Feature Grid Section: Everything a real investigation needs */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12 sm:space-y-16">
          <div className="space-y-3 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-nebius text-[#031728] tracking-tight">
              Everything a real investigation needs
            </h2>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              Not a chatbot guessing at your code — a system built to search, read, and verify before it answers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10 sm:gap-y-12">
            {/* Item 1 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <Code2 className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Tree-sitter AST Parsing
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Extract granular symbol graphs including classes, methods, docstrings, and enclosing scopes.
              </p>
            </div>

            {/* Item 2 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <Zap className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Commit-Hash Cache Efficiency
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Automatically bypass redundant vector embeddings when repository commit SHAs match.
              </p>
            </div>

            {/* Item 3 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <Bot className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Autonomous ReAct Engine
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Inspect code on disk with live multi-step tool calls, references search, and grep.
              </p>
            </div>

            {/* Item 4 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <ShieldCheck className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Verifiable Line Citations
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Pinpoint exact line-bounded source evidence for every factual claim generated.
              </p>
            </div>

            {/* Item 5 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <Layers className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Multi-Model Flexibility
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Flexibly switch between Google Gemini 3.7 Flash, OpenAI GPT-4o, and local mock runners.
              </p>
            </div>

            {/* Item 6 */}
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-[#F9FAFB] flex items-center justify-center text-[#031728] border border-[#E5E7EB] shadow-xs">
                <Lock className="w-5 h-5 text-slate-800" />
              </div>
              <h3 className="text-base font-semibold text-[#031728]">
                Offline Local Security
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Operate fully local with strict path traversal guards without transmitting proprietary code.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Three Core Architecture Layers (Nebius Solid Blue Cards without badges) */}
      {/* 4. Three Core Architecture Layers (Nebius Solid Lime-Yellow Cards) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-10 sm:space-y-12">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#031728] tracking-tight">
              Three Core Architecture Layers
            </h2>
            <p className="text-slate-600 text-sm sm:text-base font-normal">
              Explore how RepoPilot transforms raw Git files into live verified intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Card 1: Ingestion & Filtering */}
            <div
              onClick={onNavigateToConnect}
              className="cursor-pointer bg-[#D2FE22] hover:bg-[#c6f315] rounded-xl p-8 space-y-6 flex flex-col justify-between text-[#031728] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group"
            >
              <div className="space-y-3">
                <h3 className="text-lg sm:text-xl font-bold text-[#031728] leading-snug">
                  Ingestion & Filtering
                </h3>
                <p className="text-sm sm:text-base text-[#031728]/90 leading-relaxed font-normal">
                  Clone repositories over HTTPS, SSH, or local URIs. Compute deterministic SHA-256 IDs,
                  filter lockfiles and binaries, and track commit histories.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#031728] pt-2">
                <span>Connect Codebase</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#031728]" />
              </div>
            </div>

            {/* Card 2: AST Symbols & ChromaDB */}
            <div
              onClick={onNavigateToDashboard}
              className="cursor-pointer bg-[#D2FE22] hover:bg-[#c6f315] rounded-xl p-8 space-y-6 flex flex-col justify-between text-[#031728] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group"
            >
              <div className="space-y-3">
                <h3 className="text-lg sm:text-xl font-bold text-[#031728] leading-snug">
                  AST Symbols & ChromaDB
                </h3>
                <p className="text-sm sm:text-base text-[#031728]/90 leading-relaxed font-normal">
                  Extract semantic symbols using Tree-sitter. Compute context-enriched vector embeddings
                  with commit-hash caching to prevent redundant computation.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#031728] pt-2">
                <span>Browse Repositories</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#031728]" />
              </div>
            </div>

            {/* Card 3: ReAct Agent & Citations */}
            <div
              onClick={onNavigateToAsk}
              className="cursor-pointer bg-[#D2FE22] hover:bg-[#c6f315] rounded-xl p-8 space-y-6 flex flex-col justify-between text-[#031728] shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group"
            >
              <div className="space-y-3">
                <h3 className="text-lg sm:text-xl font-bold text-[#031728] leading-snug">
                  ReAct Agent & Citations
                </h3>
                <p className="text-sm sm:text-base text-[#031728]/90 leading-relaxed font-normal">
                  Autonomous investigation loop with real-time SSE streaming steps, multi-tool execution,
                  and synthesized explanations linked to exact source line snippets.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#031728] pt-2">
                <span>Start Investigation</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform text-[#031728]" />
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* 6. Benchmark & Performance Metrics */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="space-y-3 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 font-nebius">
              Production Verified
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728]">
              Benchmark-backed performance and accuracy
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Tested across industry standard repositories for resilience, determinism, and zero hallucination.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="nebius-card p-8 space-y-3 bg-[#f8fafc]">
              <div className="text-4xl font-extrabold font-nebius text-[#031728]">38 / 38</div>
              <div className="text-sm font-bold text-slate-800">Unit & Integration Tests Passing</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                100% offline verification across ingestion, AST parsing, ChromaDB vector indexing, and ReAct agent loop.
              </p>
            </div>

            <div className="nebius-card p-8 space-y-3 bg-[#f8fafc]">
              <div className="text-4xl font-extrabold font-nebius text-[#031728]">7 Tools</div>
              <div className="text-sm font-bold text-slate-800">Autonomous Codebase Inspection</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Native search, symbol lookup, slice reader, call-site references, git blame, ripgrep, and directory tree.
              </p>
            </div>

            <div className="nebius-card p-8 space-y-3 bg-[#f8fafc]">
              <div className="text-4xl font-extrabold font-nebius text-[#031728]">&lt; 1s</div>
              <div className="text-sm font-bold text-slate-800">AST Symbol Table Resolution</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sub-second lookup across classes and functions, backed by commit-hash caching to eliminate redundant work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Interactive FAQ Accordion */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#f8fafc] border-b border-slate-200">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 font-nebius">
              Frequently Asked
            </span>
            <h2 className="text-3xl font-bold font-nebius text-[#031728]">
              Questions and answers about RepoPilot
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed">
              Everything you need to know about AST indexing, vector search, agent loops, and security.
            </p>
          </div>

          <div className="lg:col-span-8 space-y-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all shadow-sm"
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left font-semibold text-slate-900 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-base font-nebius pr-4">{faq.question}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-black' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-6 pt-1 text-sm text-slate-600 leading-relaxed border-t border-slate-100">
                      {faq.answer}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 8. Get Started with RepoPilot Section (2-Column Grid with 5 Cards) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="space-y-3 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 font-nebius">
              Onboarding & Resources
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728]">
              Get started with RepoPilot
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Everything you need to try it, understand it, and get help along the way.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1 */}
            <div
              onClick={onNavigateToConnect}
              className="nebius-card p-6 sm:p-8 space-y-3 bg-white border border-slate-200/90 rounded-2xl hover:border-slate-300 transition-all shadow-xs cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200 mb-3">
                  <FolderGit2 className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-nebius text-[#031728] group-hover:text-black">
                  Connect a Public or Private Repository
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Link any Git repository over HTTPS or SSH. RepoPilot automatically clones the codebase into an isolated working directory and tracks branches.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#031728] group-hover:translate-x-0.5 transition-transform">
                <span>Connect repository</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Card 2 */}
            <div
              onClick={onNavigateToDashboard}
              className="nebius-card p-6 sm:p-8 space-y-3 bg-white border border-slate-200/90 rounded-2xl hover:border-slate-300 transition-all shadow-xs cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200 mb-3">
                  <Code2 className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-nebius text-[#031728] group-hover:text-black">
                  Build Deterministic AST Symbol Graphs
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Tree-sitter parses Python, JavaScript, and TypeScript into syntax nodes including classes, functions, and enclosing scopes with sub-second lookup.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#031728] group-hover:translate-x-0.5 transition-transform">
                <span>Browse symbol tables</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Card 3 */}
            <div
              onClick={onNavigateToDashboard}
              className="nebius-card p-6 sm:p-8 space-y-3 bg-white border border-slate-200/90 rounded-2xl hover:border-slate-300 transition-all shadow-xs cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200 mb-3">
                  <Database className="w-4 h-4 text-sky-600" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-nebius text-[#031728] group-hover:text-black">
                  Semantic Retrieval with ChromaDB
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Generate vector embeddings for high-relevance code chunks with automatic commit-hash caching to eliminate redundant processing.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#031728] group-hover:translate-x-0.5 transition-transform">
                <span>View vector index</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Card 4 */}
            <div
              onClick={onNavigateToAsk}
              className="nebius-card p-6 sm:p-8 space-y-3 bg-white border border-slate-200/90 rounded-2xl hover:border-slate-300 transition-all shadow-xs cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200 mb-3">
                  <Bot className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-nebius text-[#031728] group-hover:text-black">
                  Ask Questions with ReAct Citations
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Execute autonomous reasoning investigations with live step-by-step SSE streaming and verifiable line-bounded evidence direct from disk.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#031728] group-hover:translate-x-0.5 transition-transform">
                <span>Launch assistant</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Card 5 (Alone in its row in a 2-column grid) */}
            <div
              onClick={() => window.open('http://localhost:8000/docs', '_blank')}
              className="nebius-card p-6 sm:p-8 space-y-3 bg-white border border-slate-200/90 rounded-2xl hover:border-slate-300 transition-all shadow-xs cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 border border-slate-200 mb-3">
                  <Terminal className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-nebius text-[#031728] group-hover:text-black">
                  Integrate via Python Client & REST API
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Leverage FastAPI REST endpoints or the lightweight repopilot Python client to automate codebase analysis in your CI/CD workflows.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-1.5 text-xs font-bold text-[#031728] group-hover:translate-x-0.5 transition-transform">
                <span>Explore OpenAPI docs</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Bottom Call to Action: Ready to try RepoPilot? (Inset Rectangular Card) */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="bg-[#002238] text-white p-10 sm:p-14 lg:p-16 rounded-xs sm:rounded-sm space-y-5">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-sans text-white tracking-tight">
              {isAuthenticated ? 'Ready to explore your codebase?' : 'Ready to try RepoPilot?'}
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
              {isAuthenticated
                ? 'Jump straight back into your repositories, run deep AST investigations, or index new projects.'
                : 'Join the RepoPilot early preview to get indexing credits, AST symbol search, community access, and office hours.'}
            </p>
            <div className="pt-2">
              {isAuthenticated ? (
                <button
                  onClick={onNavigateToDashboard}
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-semibold bg-[#D2FE22] text-[#031728] hover:bg-[#c4f014] transition-colors shadow-sm cursor-pointer"
                >
                  <span>Launch Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (onRegister) {
                      onRegister()
                    }
                  }}
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold bg-white text-[#031728] hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
                >
                  Register now
                </button>
              )}
            </div>
          </div>
        </div>
      </section>


    </div>
  )
}
