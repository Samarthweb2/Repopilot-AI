import React, { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { DashboardView } from './views/DashboardView'
import { ConnectRepoView } from './views/ConnectRepoView'
import { AskView } from './views/AskView'
import { checkBackendHealth, getRepos } from './lib/api'
import { RepoSummary } from './types'
import {
  ArrowRight,
  Compass,
  Database,
  ExternalLink,
  FileCode,
  FolderGit2,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'connect' | 'ask'>('dashboard')
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null)
  const [backendHealthy, setBackendHealthy] = useState<boolean>(true)

  const refreshRepos = async () => {
    try {
      const data = await getRepos()
      setRepos(data)
      if (data.length > 0 && !activeRepoId) {
        setActiveRepoId(data[0].repo_id)
      }
    } catch (err) {
      console.error('Error fetching repositories in App:', err)
    }
  }

  const pollHealth = async () => {
    const ok = await checkBackendHealth()
    setBackendHealthy(ok)
  }

  useEffect(() => {
    pollHealth()
    refreshRepos()

    const interval = setInterval(() => {
      pollHealth()
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const handleRepoConnected = (repo: RepoSummary) => {
    setActiveRepoId(repo.repo_id)
    refreshRepos()
  }

  const handleNavigateToAsk = (repoId: string) => {
    setActiveRepoId(repoId)
    setActiveTab('ask')
    // Smooth scroll down to main interactive panel
    const mainSection = document.getElementById('nebius-main-content')
    if (mainSection) {
      mainSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-[#031728] font-sans antialiased selection:bg-[#D2FE22] selection:text-black">
      {/* Top Navbar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        repos={repos}
        activeRepoId={activeRepoId}
        setActiveRepoId={setActiveRepoId}
        backendHealthy={backendHealthy}
      />

      {/* Signature Nebius Mosaic Hero Section */}
      <section className="nebius-hero-container border-b border-black/10 py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="nebius-mosaic-pattern" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">
          {/* Frosted Pill Tags */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="nebius-pill-tag">
              RepoPilot Autonomous Engine
            </span>
            <span className="nebius-pill-tag">
              Early Preview • v0.1.0
            </span>
          </div>

          {/* Chunky Techno-Monospace Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold font-nebius text-[#031728] tracking-tight leading-[1.1] max-w-4xl">
            RepoPilot Autonomous Engine
          </h1>

          {/* Nebius Description Paragraphs */}
          <div className="text-[#031728] text-base sm:text-lg max-w-3xl space-y-2 leading-relaxed opacity-95">
            <p>
              Autonomous code intelligence engineered from AST parsing to ReAct agent investigation loop.
              Index any Git repository with Tree-sitter symbols and ChromaDB semantic embeddings.
            </p>
            <p className="font-normal text-slate-800">
              Serve a query. Search code semantically. Read exact source slices from disk. Trace references and history. Synthesize verifiable answers backed by per-claim citations.
            </p>
          </div>

          {/* Dual Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => {
                setActiveTab('ask')
                const el = document.getElementById('nebius-main-content')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="nebius-btn-primary cursor-pointer text-sm sm:text-base font-semibold"
            >
              <span>Investigate Codebase</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setActiveTab('connect')
                const el = document.getElementById('nebius-main-content')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="nebius-btn-secondary cursor-pointer text-sm sm:text-base font-semibold"
            >
              <span>Connect Repository</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('dashboard')
                const el = document.getElementById('nebius-main-content')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="nebius-btn-secondary cursor-pointer text-sm sm:text-base font-semibold"
            >
              <span>Browse Repositories ({repos.length})</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main View Workspace */}
      <main id="nebius-main-content" className="flex-1 bg-[#f8fafc] py-8 relative z-10">
        {activeTab === 'dashboard' && (
          <DashboardView
            onSelectRepo={(id) => setActiveRepoId(id)}
            onNavigateToConnect={() => setActiveTab('connect')}
            onNavigateToAsk={handleNavigateToAsk}
            activeRepoId={activeRepoId}
          />
        )}

        {activeTab === 'connect' && (
          <ConnectRepoView
            onRepoConnected={handleRepoConnected}
            onNavigateToAsk={handleNavigateToAsk}
          />
        )}

        {activeTab === 'ask' && (
          <AskView
            repos={repos}
            activeRepoId={activeRepoId}
            onSelectRepo={(id) => setActiveRepoId(id)}
          />
        )}
      </main>

      {/* Nebius Minimalist Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="nebius-logo-badge text-xs font-black px-2 py-0.5">
              REPOPILOT
            </div>
            <span className="font-semibold text-slate-900">RepoPilot AI</span>
            <span>—</span>
            <span>Autonomous Code Intelligence Platform</span>
          </div>

          <div className="flex items-center gap-4 text-slate-500 font-medium">
            <span>Tree-sitter AST</span>
            <span>•</span>
            <span>ChromaDB Vector Store</span>
            <span>•</span>
            <span>ReAct Evidence Citations</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
