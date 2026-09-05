/** TypeScript interfaces matching the RepoPilot backend schemas */

export interface FileInfo {
  path: string;
  extension: string;
  size: number;
}

export interface RepoStatus {
  repo_id: string;
  url: string;
  branch: string;
  commit_hash: string;
  file_count: number;
  files: FileInfo[];
}

export interface RepoSummary {
  repo_id: string;
  url: string;
  branch: string;
  commit_hash: string;
  commit_message?: string | null;
  commit_date?: string | null;
  file_count: number;
  is_indexed: boolean;
  indexed_chunks: number;
  status: 'cloned' | 'indexed' | string;
}

export interface IndexingResult {
  repo_id: string;
  commit_hash: string;
  status: 'completed' | 'skipped' | 'failed' | string;
  chunks_count: number;
  symbols_count: number;
  skipped: boolean;
  message?: string;
}

export interface AgentStep {
  step_number: number;
  thought?: string | null;
  tool_name?: string | null;
  tool_input: Record<string, any>;
  observation: string;
}

export interface EvidenceCitation {
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_name?: string | null;
  code_snippet: string;
  relevance_explanation: string;
  claim?: string | null;
}

export interface QueryResponse {
  repo_id: string;
  query: string;
  answer: string;
  evidence: EvidenceCitation[];
  steps: AgentStep[];
  total_steps: number;
  completed: boolean;
}

export interface FileContentResponse {
  repo_id: string;
  file_path: string;
  total_lines: number;
  start_line: number;
  end_line: number;
  content: string;
}

export type SSEEventType =
  | 'start'
  | 'step_start'
  | 'step_complete'
  | 'synthesizing'
  | 'complete'
  | 'error';

export interface SSEStreamEvent {
  event: SSEEventType;
  data: any;
}
