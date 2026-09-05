"""Data models for RepoPilot Agent, investigation steps, and evidence citations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class EvidenceCitation(BaseModel):
    """Verifiable code evidence cited by the agent during investigation."""

    file_path: str = Field(
        ...,
        description="Relative file path within the repository.",
    )
    start_line: int = Field(
        ...,
        description="1-indexed starting line number of the cited code.",
    )
    end_line: int = Field(
        ...,
        description="1-indexed ending line number of the cited code.",
    )
    symbol_name: Optional[str] = Field(
        default=None,
        description="Associated function, class, or method identifier if known.",
    )
    code_snippet: str = Field(
        ...,
        description="Exact source code lines cited.",
    )
    relevance_explanation: Optional[str] = Field(
        default=None,
        description="Explanation of why this snippet answers or supports the query.",
    )
    claim: Optional[str] = Field(
        default=None,
        description="The specific assertion or claim backed by this citation.",
    )


class AgentStep(BaseModel):
    """Represents a single ReAct step executed by the agent loop."""

    step_number: int = Field(..., description="1-indexed step number.")
    thought: Optional[str] = Field(
        default=None,
        description="Agent reasoning or internal thought before taking the action.",
    )
    tool_name: str = Field(..., description="Name of the tool executed.")
    tool_input: Dict[str, Any] = Field(
        default_factory=dict,
        description="Arguments passed to the tool.",
    )
    observation: str = Field(
        ...,
        description="Text output or summary returned by the tool execution.",
    )


class QueryRequest(BaseModel):
    """Request payload for querying a repository via the autonomous agent."""

    query: str = Field(
        ...,
        min_length=1,
        description="Natural language or technical question about the repository.",
        examples=["How does this repo handle request timeouts and retries?"],
    )
    max_steps: int = Field(
        default=6,
        ge=1,
        le=15,
        description="Maximum investigation steps before forcing answer synthesis.",
    )
    model_provider: Optional[str] = Field(
        default=None,
        description="Optional LLM provider override ('gemini', 'openai', 'mock').",
    )
    model_name: Optional[str] = Field(
        default=None,
        description="Optional model identifier override (e.g. 'gemini-2.5-flash', 'gpt-4o-mini').",
    )


class QueryResponse(BaseModel):
    """Synthesized response with structured evidence citations and step trajectory."""

    repo_id: str = Field(..., description="Repository ID queried.")
    query: str = Field(..., description="The user's original query.")
    answer: str = Field(
        ...,
        description="Comprehensive synthesized answer to the query.",
    )
    evidence: List[EvidenceCitation] = Field(
        default_factory=list,
        description="Verifiable source code citations supporting the answer.",
    )
    steps: List[AgentStep] = Field(
        default_factory=list,
        description="Complete trajectory of reasoning steps and tool executions.",
    )
    total_steps: int = Field(
        ...,
        description="Total number of tool calls executed.",
    )
    completed: bool = Field(
        default=True,
        description="True if agent reached a conclusive answer, False if hit max_steps ceiling.",
    )
