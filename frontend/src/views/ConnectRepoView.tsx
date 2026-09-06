import React, { useState } from 'react'
import { connectRepo, indexRepo } from '../lib/api'
import { IndexingResult, RepoStatus, RepoSummary } from '../types'
import confetti from 'canvas-confetti'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileCode,
  FolderGit2,
  GitBranch,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react'

interface ConnectRepoViewProps {
  onRepoConnected: (repo: RepoSummary) => void
  onNavigateToAsk: (repoId: string) => void
}

const SAMPLE_REPOS = [
  { name: 'psf/requests', url: 'https://github.com/psf/requests', branch: 'main' },
  { name: 'pallets/flask', url: 'https://github.com/pallets/flask', branch: 'main' },
  { name: 'tiangolo/fastapi', url: 'https://github.com/tiangolo/fastapi', branch: 'master' },
]

export const ConnectRepoView: React.FC<ConnectRepoViewProps> = ({
  onRepoConnected,
  onNavigateToAsk,
}) => {
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [isCloning, setIsCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [connectedRepo, setConnectedRepo] = useState<RepoStatus | null>(null)

  // Indexing states
  const [isIndexing, setIsIndexing] = useState(false)
  const [forceIndex, setForceIndex] = useState(false)
  const [indexResult, setIndexResult] = useState<IndexingResult | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!repoUrl.trim()) return

    setIsCloning(true)
    setCloneError(null)
    setConnectedRepo(null)
    setIndexResult(null)
    setIndexError(null)

    try {
      const res = await connectRepo(repoUrl.trim(), branch.trim() || undefined)
      setConnectedRepo(res)
      onRepoConnected({
        repo_id: res.repo_id,
        url: res.url,
        branch: res.branch,
        commit_hash: res.commit_hash,
        file_count: res.file_count,
        is_indexed: false,
        indexed_chunks: 0,
        status: 'cloned',
      })
    } catch (err: any) {
      setCloneError(err.message || 'Failed to clone or access repository.')
    } finally {
      setIsCloning(false)
    }
  }

  const handleIndex = async () => {
    if (!connectedRepo) return

    setIsIndexing(true)
    setIndexError(null)
    setIndexResult(null)

    try {
      const res = await indexRepo(connectedRepo.repo_id, forceIndex)
      setIndexResult(res)

      if (res.status === 'completed' || res.status === 'indexed') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        })
      }

      onRepoConnected({
        repo_id: connectedRepo.repo_id,
        url: connectedRepo.url,
        branch: connectedRepo.branch,
        commit_hash: connectedRepo.commit_hash,
        file_count: connectedRepo.file_count,
        is_indexed: res.status === 'completed' || res.status === 'indexed' || res.status === 'skipped',
        indexed_chunks: res.chunks_count,
        status: res.status,
      })
    } catch (err: any) {
      setIndexError(err.message || 'Error occurred while indexing repository.')
      setIndexResult({
        repo_id: connectedRepo.repo_id,
        commit_hash: connectedRepo.commit_hash,
        status: 'failed',
        chunks_count: 0,
        symbols_count: 0,
        skipped: false,
        message: err.message,
      })
    } finally {
      setIsIndexing(false)
    }
  }

  const selectSample = (sample: typeof SAMPLE_REPOS[0]) => {
    setRepoUrl(sample.url)
    setBranch(sample.branch)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Title section */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D2FE22]/20 border border-[#D2FE22] text-slate-900 text-xs font-bold tracking-wide uppercase">
          <Sparkles className="w-3.5 h-3.5 text-black" /> Ingestion & AST Extraction
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold font-nebius text-[#031728] tracking-tight">
          Connect & Index a Codebase
        </h2>
        <p className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
          Clone any Git repository. Tree-sitter extracts the AST symbol table, and ChromaDB indexes
          code chunks with commit-hash caching.
        </p>
      </div>

      {/* Connect Form Card */}
      <div className="nebius-card p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-[#031728] flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-[#031728]" />
            Repository Parameters
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Specify the repository URL and optional target branch.
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Git Repository URL <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                id="repo-url-input"
                type="text"
                placeholder="https://github.com/psf/requests"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-[#031728] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D2FE22] focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Target Branch <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="relative flex items-center">
                <GitBranch className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  id="repo-branch-input"
                  type="text"
                  placeholder="e.g. main, master"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-white text-sm text-[#031728] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D2FE22] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Quick Examples */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Quick Examples
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                {SAMPLE_REPOS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => selectSample(s)}
                    className="px-3 py-1.5 text-xs rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-200 transition-colors cursor-pointer"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {cloneError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Connection Failed</div>
                <div className="text-xs mt-0.5">{cloneError}</div>
              </div>
            </div>
          )}

          <button
            id="connect-repo-btn"
            type="submit"
            disabled={isCloning}
            className="nebius-btn-primary w-full py-3.5 cursor-pointer font-bold justify-center"
          >
            {isCloning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Cloning & Walking Tree...</span>
              </>
            ) : (
              <>
                <FolderGit2 className="w-4 h-4" />
                <span>Clone / Connect Repository</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Step 2: Index Repository Card */}
      {connectedRepo && (
        <div className="nebius-card p-6 sm:p-8 space-y-6 border-slate-300 animate-slideDown">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-[#031728]">Repository Cloned & Inspected</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target code files filtered. Ready for Tree-sitter AST parsing & vector store embedding.
              </p>
            </div>

            <span className="font-mono text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
              ID: {connectedRepo.repo_id}
            </span>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Branch
              </div>
              <div className="text-sm font-bold text-[#031728] flex items-center gap-1.5 mt-1">
                <GitBranch className="w-3.5 h-3.5 text-slate-700" />
                {connectedRepo.branch}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Commit SHA
              </div>
              <div className="text-sm font-mono text-slate-700 mt-1">
                {connectedRepo.commit_hash.slice(0, 8)}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Code Files
              </div>
              <div className="text-sm font-bold text-[#031728] flex items-center gap-1.5 mt-1">
                <FileCode className="w-3.5 h-3.5 text-slate-700" />
                {connectedRepo.file_count} files
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                Status
              </div>
              <div className="mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Cloned
                </span>
              </div>
            </div>
          </div>

          {/* Explicit Indexing Action Box */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#F6FFE0] via-slate-50 to-white border border-[#D2FE22] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-[#031728] flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#031728]" />
                  Explicit Vector Indexing
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Calls <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-800">POST /repos/{connectedRepo.repo_id}/index</code>{' '}
                  to extract AST chunks and embed them into ChromaDB.
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceIndex}
                  onChange={(e) => setForceIndex(e.target.checked)}
                  className="rounded border-slate-300 text-[#031728] focus:ring-[#D2FE22]"
                />
                <span>Force Re-index</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                id="index-repository-btn"
                onClick={handleIndex}
                disabled={isIndexing}
                className="nebius-btn-primary cursor-pointer font-bold"
              >
                {isIndexing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#D2FE22]" />
                    <span>Parsing AST & Embedding Chunks...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-[#D2FE22]" />
                    <span>Index Repository</span>
                  </>
                )}
              </button>

              {indexResult && (
                <button
                  onClick={() => onNavigateToAsk(connectedRepo.repo_id)}
                  className="nebius-btn-secondary cursor-pointer font-bold flex items-center gap-1.5"
                >
                  <span>Open in Ask View</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status Feedback Badge */}
            {indexResult && (
              <div
                id="index-status-feedback"
                className={`p-4 rounded-xl border text-sm flex items-start gap-3 animate-fadeIn ${
                  indexResult.status === 'completed' || indexResult.status === 'indexed'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : indexResult.status === 'skipped'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {(indexResult.status === 'completed' || indexResult.status === 'indexed') && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                )}
                {indexResult.status === 'skipped' && (
                  <RefreshCw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                {indexResult.status === 'failed' && (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}

                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    <span>Status:</span>
                    <span className="font-mono uppercase font-black px-2 py-0.5 rounded text-xs bg-white border border-black/10">
                      {indexResult.status}
                    </span>
                  </div>

                  <p className="text-xs opacity-90 leading-relaxed">
                    {indexResult.message ||
                      (indexResult.status === 'completed'
                        ? `Successfully embedded ${indexResult.chunks_count} AST chunks across ${indexResult.symbols_count} symbols into ChromaDB.`
                        : indexResult.status === 'skipped'
                        ? `Commit ${indexResult.commit_hash.slice(0, 8)} is already indexed. Embedding skipped (cache hit).`
                        : 'Failed to index repository.')}
                  </p>
                </div>
              </div>
            )}

            {indexError && !indexResult && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Indexing Error</div>
                  <div className="text-xs mt-0.5">{indexError}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
