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
  X,
  Zap,
} from 'lucide-react'

interface LandingPageViewProps {
  onNavigateToConnect: () => void
  onNavigateToDashboard: () => void
  onNavigateToAsk: () => void
  onRegister?: () => void
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
  repoCount,
}) => {
  const [copiedCode, setCopiedCode] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [showRegisterModal, setShowRegisterModal] = useState(false)

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
      {/* 1. Hero Section: Full-bleed Lime Gradient (135deg, #D7F227 to #A3E635) with 40px subtle grid texture */}
      <section className="nebius-hero-container text-[#031728] py-20 lg:py-28 px-4 sm:px-6 lg:px-8 border-b border-black/10">
        {/* Subtle grid texture overlay: 40px intervals, 4% black opacity, horizontal & vertical */}
        <div className="nebius-hero-grid" />

        <div className="max-w-7xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Copy & Actions */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-7">
            {/* Top Frosted Pill Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="nebius-pill-tag">
                RepoPilot AI
              </span>
              <span className="nebius-pill-tag">
                Early Preview
              </span>
            </div>

            {/* Word-by-word typewriter headline in Space Mono font */}
            <div className="space-y-4 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-['Space_Mono',monospace] text-[#031728] tracking-tight leading-snug min-h-[3.5rem] sm:min-h-[4.2rem]">
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
                className={`space-y-6 transition-all duration-500 ease-out ${
                  isTypingComplete
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2 pointer-events-none'
                }`}
              >
                <p className="text-slate-800/90 text-sm sm:text-base font-normal leading-relaxed max-w-xl">
                  Every claim cited down to the exact line.
                </p>

                {/* Two Action Buttons: Register now & Launch Workspace */}
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <button
                    id="hero-btn-register"
                    onClick={() => {
                      if (onRegister) {
                        onRegister()
                      } else {
                        setShowRegisterModal(true)
                      }
                    }}
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-full text-sm font-semibold bg-[#031728] text-white hover:bg-[#072440] transition-all shadow-sm cursor-pointer"
                  >
                    <span>Register now</span>
                  </button>

                  <button
                    id="hero-btn-launch"
                    onClick={onNavigateToAsk}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold bg-white/45 text-[#031728] hover:bg-white/65 border border-black/15 transition-all shadow-xs cursor-pointer backdrop-blur-md"
                  >
                    <span>Launch Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Graphic Frame (Static, No Floating) */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            {/* Ambient Backlight Glow */}
            <div className="absolute -inset-2 bg-gradient-to-tr from-white/60 via-[#d7f227]/50 to-white/40 rounded-3xl blur-2xl -z-10 opacity-75" />

            {/* Clean Static Illustration Frame */}
            <div className="relative w-full max-w-[460px] select-none rounded-2xl overflow-hidden border border-black/15 shadow-2xl bg-white/20 backdrop-blur-sm">
              <img
                src="/hero-developer.png"
                alt="RepoPilot AI Codebase Intelligence"
                className="w-full h-auto object-cover rounded-2xl block"
              />
              {/* Subtle reflection overlay */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-transparent via-white/5 to-transparent opacity-20" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Media Feature Block: Production Speed Showcase */}
      <section className="py-16 lg:py-24 px-4 sm:px-6 lg:px-8 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Text */}
          <div className="lg:col-span-5 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Deterministic AST + Embeddings</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728] leading-tight">
              Run open-source code intelligence at production speed
            </h2>

            <div className="text-slate-600 space-y-3 text-base leading-relaxed">
              <p>
                Deploy code analysis on repositories like <strong>psf/requests</strong>,{' '}
                <strong>pallets/flask</strong>, and <strong>tiangolo/fastapi</strong> with
                sub-second targets and 100% deterministic symbol resolution.
              </p>
              <p>
                Tree-sitter builds granular symbol graphs (classes, methods, docstrings), while
                commit-hash caching prevents redundant embeddings. The autonomous ReAct loop
                inspects real files on disk to eliminate hallucinations.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-4">
              <button
                onClick={onNavigateToAsk}
                className="nebius-btn-primary cursor-pointer text-sm font-semibold"
              >
                <span>Try Assistant Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onNavigateToConnect}
                className="nebius-btn-secondary cursor-pointer text-sm font-semibold"
              >
                <span>Index a Repository</span>
              </button>
            </div>
          </div>

          {/* Right Interactive Mock Terminal / Model Card */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-[#031728] text-white border border-slate-800 p-6 shadow-2xl relative overflow-hidden font-mono text-xs">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-2 text-slate-300 font-bold">repopilot-agent-loop</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#D2FE22]/20 text-[#D2FE22] text-[10px] font-bold">
                  SSE ACTIVE
                </span>
              </div>

              {/* Agent Investigation Flow Simulation */}
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-slate-400 text-[11px] mb-1">
                    QUERY: <span className="text-white font-semibold">How does Session manage cookie persistence and hooks?</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#38bdf8] text-[11px]">
                    <Bot className="w-3.5 h-3.5" />
                    <span>ReAct Step 1: lookup_symbol(&quot;Session&quot;)</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-emerald-400 text-[11px] flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>FOUND: requests.sessions.Session (class) in src/requests/sessions.py:348-750</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Action: read_file_slice(&quot;src/requests/sessions.py&quot;, start=350, end=420)
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#052b42] border border-[#D2FE22]/30 text-slate-200">
                  <div className="text-[#D2FE22] font-bold text-[11px] mb-1">
                    SYNTHESIZED EXPLANATION WITH EVIDENCE:
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    In <span className="text-white font-bold">Session.__init__</span>, cookie persistence is maintained through
                    a dedicated <code className="text-[#D2FE22]">cookiejar_from_dict</code> instance, and request hooks are
                    initialized using the <code className="text-[#D2FE22]">default_hooks()</code> dictionary.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#D2FE22] text-black font-bold text-[10px]">
                      [1] requests/sessions.py:356-372
                    </span>
                    <span className="text-slate-400 text-[10px]">Disk verification confirmed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 6-Pillar Features Grid: Extended Features Block */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#f8fafc] border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 font-nebius">
              Core Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728]">
              Engineered from AST parser to verifiable agent loop
            </h2>
            <p className="text-slate-600 text-sm sm:text-base max-w-2xl">
              Six foundational pillars built for precision code navigation, autonomous reasoning, and enterprise scale.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Pillar 1 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <Cpu className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Scalability without constraints
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Parse multi-thousand file repositories into Tree-sitter AST nodes with zero latency
                bottlenecks. Handle hundreds of code symbols effortlessly with 99.9% reliability.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <Zap className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Commit-hash cache efficiency
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Experience zero redundant embeddings. If the repository commit hash is unchanged,
                indexing skips embedding generation automatically, cutting runtime to milliseconds.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Multi-model flexibility
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Choose between Google Gemini 3.7 Flash, OpenAI GPT-4o, or built-in offline mock runners.
                Switch models dynamically per investigation through a unified API.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <Bot className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Autonomous ReAct essentials
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Equipped with seven codebase inspection tools: semantic search, AST lookup, slice reading,
                references reverse-search, git blame, grep regex, and directory listing.
              </p>
            </div>

            {/* Pillar 5 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <Code2 className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Deterministic AST symbol tables
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Tree-sitter parses exact semantic units rather than arbitrary line slices. Classes,
                methods, docstrings, parameters, and parent enclosing scopes are extracted cleanly.
              </p>
            </div>

            {/* Pillar 6 */}
            <div className="nebius-card p-6 space-y-3 bg-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-900 border border-slate-200">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="text-lg font-bold font-nebius text-[#031728]">
                Verifiable per-claim citations
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Zero blind hallucinations. Every factual claim is backed by narrow, line-bounded
                source code evidence read directly from disk with interactive UI code highlight navigation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Three Specialized Product Pillar Cards */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728]">
              Three Core Architecture Layers
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Explore how RepoPilot transforms raw Git files into live verified intelligence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div
              onClick={onNavigateToConnect}
              className="cursor-pointer nebius-card-dark p-8 space-y-6 flex flex-col justify-between hover:scale-[1.02] transition-transform"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-[#D2FE22]/20 flex items-center justify-center text-[#D2FE22] font-bold">
                  01
                </div>
                <h3 className="text-xl font-bold font-nebius text-white">
                  Ingestion & Filtering
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Clone repositories over HTTPS, SSH, or local URIs. Compute deterministic SHA-256 IDs,
                  filter lockfiles and binaries, and track commit histories.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#D2FE22]">
                <span>Connect Codebase</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Card 2 */}
            <div
              onClick={onNavigateToDashboard}
              className="cursor-pointer nebius-card-dark p-8 space-y-6 flex flex-col justify-between hover:scale-[1.02] transition-transform"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-[#38bdf8]/20 flex items-center justify-center text-[#38bdf8] font-bold">
                  02
                </div>
                <h3 className="text-xl font-bold font-nebius text-white">
                  AST Symbols & ChromaDB
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Extract semantic symbols using Tree-sitter. Compute context-enriched vector embeddings
                  with commit-hash caching to prevent redundant computation.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#38bdf8]">
                <span>Browse Repositories</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Card 3 */}
            <div
              onClick={onNavigateToAsk}
              className="cursor-pointer nebius-card-dark p-8 space-y-6 flex flex-col justify-between hover:scale-[1.02] transition-transform"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-400/20 flex items-center justify-center text-emerald-400 font-bold">
                  03
                </div>
                <h3 className="text-xl font-bold font-nebius text-white">
                  ReAct Agent & Citations
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Autonomous investigation loop with real-time SSE streaming steps, multi-tool execution,
                  and synthesized explanations linked to exact source line snippets.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <span>Start Investigation</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Interactive API Code Box: Familiar API at Your Fingertips */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#f8fafc] border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="space-y-3 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 font-nebius">
              Developer Interface
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728]">
              Familiar API at your fingertips
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Simple, pythonic, and production-ready. Connect, index, and query repositories programmatically
              over standard REST and real-time Server-Sent Events (SSE).
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#031728] text-white shadow-2xl overflow-hidden font-mono text-xs">
            {/* Code Box Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-[#051f36] border-b border-slate-800">
              <div className="flex items-center gap-3">
                <Terminal className="w-4 h-4 text-[#D2FE22]" />
                <span className="font-bold text-white">example_client.py</span>
                <span className="text-slate-400 text-[11px]">Python 3.10+</span>
              </div>

              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer border border-slate-700"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#D2FE22]" />
                    <span className="text-[#D2FE22] font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">Copy snippet</span>
                  </>
                )}
              </button>
            </div>

            {/* Syntax Code Body */}
            <div className="p-6 overflow-x-auto leading-relaxed text-slate-200 bg-[#031728]">
              <pre className="font-mono text-xs sm:text-sm">
                <code>{pythonApiSnippet}</code>
              </pre>
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

      {/* 9. Bottom Call to Action: Start Your Journey (#052b42) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#052b42] text-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-white">
              Start your codebase investigation
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Connect any Git repository in seconds. Parse Tree-sitter AST symbols and ask complex
              architectural questions with verifiable line citations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={onNavigateToAsk}
              className="nebius-btn-primary cursor-pointer !bg-[#D2FE22] !text-black hover:!bg-[#e3ff5c] text-sm font-semibold"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onNavigateToConnect}
              className="nebius-btn-secondary cursor-pointer !bg-white/10 !text-white !border-white/20 hover:!bg-white/20 text-sm font-semibold"
            >
              <span>Connect Repo</span>
            </button>
          </div>
        </div>
      </section>

      {/* Register Account Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative space-y-6 text-[#031728]">
            <button
              onClick={() => setShowRegisterModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D2FE22]/20 border border-[#D2FE22] text-xs font-bold text-slate-900 uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5 text-black" />
                Register Account
              </div>
              <h3 className="text-2xl font-bold text-[#031728]">
                Get started with RepoPilot
              </h3>
              <p className="text-xs text-slate-500">
                Create an account to save indexed repositories, search history, and deep AST symbol call-chains.
              </p>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setShowRegisterModal(false)
                  onNavigateToAsk()
                }}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
              </button>

              <div className="relative flex items-center justify-center text-xs text-slate-400">
                <span className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 shrink-0">or with email</span>
                <span className="border-t border-slate-200 w-full" />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
                  <input
                    type="email"
                    placeholder="developer@company.com"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-800 leading-relaxed">
                <strong>Preview Mode:</strong> Authentication is currently placeholder UI. All codebase indexing and AI assistant features are immediately accessible without registration!
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowRegisterModal(false)
                  onNavigateToAsk()
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#031728] hover:bg-[#072440] text-white text-sm font-semibold transition-all cursor-pointer shadow-sm"
              >
                <span>Continue to Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
