import React, { useState, useEffect } from 'react'
import { getRepos, indexRepo } from '../lib/api'
import { RepoSummary } from '../types'
import { formatTimeAgo, getRepoDisplayName, truncateHash } from '../lib/utils'
import {
  Clock,
  Database,
  FileCode,
  FolderGit2,
  GitBranch,
  GitCommit,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react'

interface DashboardViewProps {
  onSelectRepo: (repoId: string) => void
  onNavigateToConnect: () => void
  onNavigateToAsk: (repoId: string) => void
  activeRepoId: string | null
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectRepo,
  onNavigateToConnect,
  onNavigateToAsk,
  activeRepoId,
}) => {
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [indexingRepoId, setIndexingRepoId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ id: string; text: string; type: 'success' | 'warning' } | null>(null)

  const loadRepos = async () => {
    setIsLoading(true)
    try {
      const data = await getRepos()
      setRepos(data)
      if (data.length > 0 && !activeRepoId) {
        onSelectRepo(data[0].repo_id)
      }
    } catch (err) {
      console.error('Failed to load repositories:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRepos()
  }, [])

  const handleQuickIndex = async (repo: RepoSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setIndexingRepoId(repo.repo_id)
    setStatusMessage(null)

    try {
      const res = await indexRepo(repo.repo_id, false)
      setStatusMessage({
        id: repo.repo_id,
        text: res.status === 'completed' ? `Indexed ${res.chunks_count} chunks` : 'Commit cache hit',
        type: res.status === 'completed' ? 'success' : 'warning',
      })
      await loadRepos()
    } catch (err: any) {
      console.error('Indexing failed:', err)
    } finally {
      setIndexingRepoId(null)
    }
  }

  const filteredRepos = repos.filter((r) => {
    const q = searchQuery.toLowerCase()
    return (
      r.url.toLowerCase().includes(q) ||
      r.branch.toLowerCase().includes(q) ||
      r.repo_id.toLowerCase().includes(q) ||
      (r.commit_message && r.commit_message.toLowerCase().includes(q))
    )
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-bold font-nebius text-[#031728] tracking-tight">
              Connected Repositories
            </h2>
            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#D2FE22] text-black">
              {repos.length} Ingested
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Browse ingested codebases, inspect latest commits, and trigger AST vector embeddings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="refresh-repos-btn"
            onClick={loadRepos}
            disabled={isLoading}
            className="nebius-btn-secondary py-2 px-4 text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            id="dashboard-connect-btn"
            onClick={onNavigateToConnect}
            className="nebius-btn-primary py-2 px-4 text-xs font-semibold cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Connect Codebase</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      {repos.length > 0 && (
        <div className="max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            id="search-repos-input"
            type="text"
            placeholder="Search by repo URL, branch, commit message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-300 bg-white text-xs sm:text-sm text-[#031728] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D2FE22] focus:border-transparent transition-all shadow-sm"
          />
        </div>
      )}

      {/* Repositories Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      ) : filteredRepos.length === 0 ? (
        /* Empty State */
        <div className="nebius-card p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#F6FFE0] border border-[#D2FE22] flex items-center justify-center text-[#031728]">
            <FolderGit2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold font-nebius text-[#031728]">No Repositories Found</h3>
          <p className="text-sm text-slate-600">
            {searchQuery
              ? 'No repository matches your search filter.'
              : 'Connect your first Git repository to start querying code with autonomous agent loops and AST indexing.'}
          </p>
          <div>
            <button
              id="empty-state-connect-btn"
              onClick={onNavigateToConnect}
              className="nebius-btn-primary cursor-pointer font-bold"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Connect Repository</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRepos.map((repo) => {
            const isSelected = repo.repo_id === activeRepoId
            const isIndexing = indexingRepoId === repo.repo_id

            return (
              <div
                key={repo.repo_id}
                onClick={() => onSelectRepo(repo.repo_id)}
                className={`nebius-card cursor-pointer flex flex-col justify-between relative overflow-hidden group p-6 ${
                  isSelected
                    ? 'ring-2 ring-[#031728] border-black/30'
                    : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                {/* Active Indicator Strip */}
                {isSelected && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#D2FE22]" />
                )}

                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-[#031728] group-hover:text-black transition-colors flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-slate-800 shrink-0" />
                        <span className="truncate max-w-[190px]" title={repo.url}>
                          {getRepoDisplayName(repo.url)}
                        </span>
                      </h4>

                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          <GitBranch className="w-3 h-3 text-slate-600" />
                          {repo.branch}
                        </span>

                        <span className="font-mono text-[11px] text-slate-400">
                          ID: {repo.repo_id}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        repo.is_indexed
                          ? 'bg-[#D2FE22]/25 text-[#031728] border-[#D2FE22]'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {repo.is_indexed ? 'Indexed' : 'Cloned'}
                    </span>
                  </div>

                  {/* Latest Commit Details */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-mono font-semibold text-slate-800">
                        <GitCommit className="w-3.5 h-3.5 text-slate-600" />
                        {truncateHash(repo.commit_hash)}
                      </span>
                      {repo.commit_date && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(repo.commit_date)}
                        </span>
                      )}
                    </div>

                    {repo.commit_message ? (
                      <p className="text-xs text-slate-700 line-clamp-2 italic font-mono leading-snug">
                        "{repo.commit_message}"
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No commit message recorded</p>
                    )}
                  </div>

                  {/* Counters */}
                  <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-slate-500" />
                      <strong className="text-slate-900">{repo.file_count}</strong> code files
                    </span>

                    {repo.is_indexed && repo.indexed_chunks > 0 && (
                      <span className="flex items-center gap-1 text-slate-800 font-semibold">
                        <Database className="w-3.5 h-3.5 text-slate-600" />
                        {repo.indexed_chunks} chunks
                      </span>
                    )}
                  </div>

                  {statusMessage && statusMessage.id === repo.repo_id && (
                    <div
                      className={`text-xs p-2 rounded-lg border font-medium ${
                        statusMessage.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {statusMessage.text}
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={(e) => handleQuickIndex(repo, e)}
                    disabled={isIndexing}
                    className="nebius-btn-secondary text-xs py-1.5 px-3.5 font-semibold cursor-pointer"
                  >
                    <Zap className="w-3 h-3 text-[#B5DD00]" />
                    <span>{repo.is_indexed ? 'Re-Index' : 'Index Chunks'}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectRepo(repo.repo_id)
                      onNavigateToAsk(repo.repo_id)
                    }}
                    className="nebius-btn-primary text-xs py-1.5 px-4 font-semibold cursor-pointer"
                  >
                    <span>Ask Agent</span>
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
