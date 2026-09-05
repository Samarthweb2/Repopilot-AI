"""Autonomous agent investigation loop for RepoPilot."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from repopilot.agent.llm import BaseLLMClient, LLMStepResult, get_llm_client
from repopilot.agent.models import AgentStep, EvidenceCitation, QueryResponse
from repopilot.tools.code_tools import TOOL_DEFINITIONS, CodebaseTools

import re

logger = logging.getLogger("repopilot.agent.loop")

SYSTEM_PROMPT = """You are RepoPilot, an autonomous Senior Codebase Assistant.
Your mission is to thoroughly investigate and answer questions about this repository using verifiable code evidence.

AVAILABLE TOOLS:
- search_code(query): Semantic search over code chunks.
- lookup_symbol(symbol_name, exact): AST symbol table lookup.
- read_file_slice(file_path, start_line, end_line): Read exact line ranges from disk (max 200 lines).
- list_directory(directory): List repository directories and files.
- get_references(symbol_name): Text-based reverse lookup finding all call sites of a symbol across indexed chunks.
- git_blame(file_path, start_line, end_line): Git commit history and authorship per line.
- grep(pattern, file_glob): Regex or text search across repository files (capped at 50 matches).

WORKFLOW GUIDELINES:
1. Discover with search_code or grep: Find relevant functions, classes, and logic.
2. Target with lookup_symbol or get_references: Find declarations and all call sites.
3. Verify with read_file_slice: ALWAYS read actual lines from disk before concluding.
4. History with git_blame: Inspect when and why logic changed if asked about history.
5. Synthesize with per-claim citations: At the end of your final answer, provide specific, narrow citations paired per-claim. Each citation must target the exact, narrow line range (e.g. 2-10 lines) that directly backs an individual assertion or claim, not the entire broad file slice read during investigation.
Format citations at the end of your response using:
```citations
[
  {
    "file_path": "path/to/file.py",
    "start_line": 10,
    "end_line": 15,
    "claim": "Specific assertion supported by these lines",
    "symbol_name": "optional_symbol_name"
  }
]
```
"""


class AgentLoop:
    """Orchestrates the autonomous ReAct investigation cycle."""

    def __init__(
        self,
        repo_id: str,
        target_dir: Path,
        tools: Optional[CodebaseTools] = None,
        llm_client: Optional[BaseLLMClient] = None,
    ) -> None:
        self.repo_id = repo_id
        self.target_dir = Path(target_dir).resolve()
        self.tools = tools or CodebaseTools(repo_id=self.repo_id, target_dir=self.target_dir)
        self.llm_client = llm_client or get_llm_client()

    def _read_disk_snippet(self, file_path: str, start_line: int, end_line: int) -> str:
        """Helper to read exact lines from disk for evidence snippets."""
        full_path = self.target_dir / file_path.lstrip("/\\")
        if full_path.exists() and full_path.is_file():
            try:
                with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                selected = lines[max(0, start_line - 1) : min(len(lines), end_line)]
                return "".join(selected).strip()
            except Exception:
                pass
        return ""

    def _extract_evidence(
        self, answer_text: str, steps: List[AgentStep]
    ) -> tuple[str, List[EvidenceCitation]]:
        """Extract structured EvidenceCitation records paired per-claim or from tool history.

        Returns (cleaned_answer_text, citations_list).
        """
        evidence: List[EvidenceCitation] = []
        seen_ranges = set()
        clean_answer = answer_text

        # 1. Attempt to parse per-claim JSON citations block from answer_text
        citations_match = re.search(
            r"```(?:citations|json)?\s*(\[\s*\{.*?\}\s*\])\s*```",
            answer_text,
            re.DOTALL | re.IGNORECASE,
        )
        if citations_match:
            raw_json = citations_match.group(1)
            try:
                items = json.loads(raw_json)
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict) and "file_path" in item:
                            fpath = str(item["file_path"])
                            s_line = int(item.get("start_line", 1))
                            e_line = int(item.get("end_line", s_line))
                            claim = str(item.get("claim") or item.get("relevance_explanation") or "")
                            sym = item.get("symbol_name")

                            key = (fpath, s_line, e_line)
                            if key not in seen_ranges:
                                seen_ranges.add(key)
                                snippet = self._read_disk_snippet(fpath, s_line, e_line)
                                evidence.append(
                                    EvidenceCitation(
                                        file_path=fpath,
                                        start_line=s_line,
                                        end_line=e_line,
                                        symbol_name=sym,
                                        code_snippet=snippet or f"(Cited lines {s_line}-{e_line})",
                                        relevance_explanation=claim or f"Claim evidence from {fpath}:{s_line}-{e_line}",
                                        claim=claim or None,
                                    )
                                )
                    # Strip raw citations block from user-facing answer text
                    clean_answer = answer_text[: citations_match.start()].rstrip()
            except Exception as e:
                logger.debug("Could not parse structured citations block as JSON: %s", e)

        # 2. Attempt to parse markdown citation list if no JSON citations parsed
        if not evidence:
            md_matches = re.findall(
                r"(?:^|\n)\s*[-*]\s+`?([a-zA-Z0-9_./\\-]+):(\d+)-(\d+)`?\s*[:\-–—]\s*(.+)",
                answer_text,
            )
            for fpath, s_str, e_str, claim_text in md_matches:
                s_line, e_line = int(s_str), int(e_str)
                key = (fpath, s_line, e_line)
                if key not in seen_ranges:
                    seen_ranges.add(key)
                    snippet = self._read_disk_snippet(fpath, s_line, e_line)
                    evidence.append(
                        EvidenceCitation(
                            file_path=fpath,
                            start_line=s_line,
                            end_line=e_line,
                            code_snippet=snippet or f"(Cited lines {s_line}-{e_line})",
                            relevance_explanation=claim_text.strip(),
                            claim=claim_text.strip(),
                        )
                    )

        # 3. Fallback: If no per-claim citations found, fall back to tool observation history
        if not evidence:
            for step in steps:
                if step.tool_name == "read_file_slice":
                    file_path = step.tool_input.get("file_path", "")
                    start_line = int(step.tool_input.get("start_line", 1))
                    end_line = int(step.tool_input.get("end_line", 1))

                    key = (file_path, start_line, end_line)
                    if key in seen_ranges:
                        continue
                    seen_ranges.add(key)

                    snippet = self._read_disk_snippet(file_path, start_line, end_line)
                    evidence.append(
                        EvidenceCitation(
                            file_path=file_path,
                            start_line=start_line,
                            end_line=end_line,
                            code_snippet=snippet or step.observation[:300],
                            relevance_explanation=f"Inspected in Step {step.step_number} to verify logic.",
                        )
                    )

        # 4. Final fallback to search_code observations if no read_file_slice
        if not evidence:
            for step in steps:
                if step.tool_name == "search_code":
                    obs = step.observation
                    for line in obs.splitlines():
                        if "File:" in line and "Symbol:" in line:
                            try:
                                file_part = line.split("File:")[1].split("|")[0].strip()
                                sym_part = line.split("Symbol:")[1].split("|")[0].strip()
                                if ":" in file_part:
                                    fpath, lines_range = file_part.split(":", 1)
                                    if "-" in lines_range:
                                        s_str, e_str = lines_range.split("-", 1)
                                        s_line, e_line = int(s_str), int(e_str)
                                        key = (fpath, s_line, e_line)
                                        if key not in seen_ranges:
                                            seen_ranges.add(key)
                                            evidence.append(
                                                EvidenceCitation(
                                                    file_path=fpath,
                                                    start_line=s_line,
                                                    end_line=e_line,
                                                    symbol_name=sym_part,
                                                    code_snippet=f"(Extracted from semantic search match for {sym_part})",
                                                    relevance_explanation=f"Identified in Step {step.step_number} as semantically relevant.",
                                                )
                                            )
                            except Exception:
                                pass
                    if evidence:
                        break

        return clean_answer, evidence

    async def run_stream(self, query: str, max_steps: int = 6):
        """Run the multi-step investigation loop, yielding SSE event dicts for live streaming."""
        max_steps = max(1, min(max_steps, 15))
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ]

        steps: List[AgentStep] = []
        completed = False
        final_answer = ""

        yield {
            "event": "start",
            "data": {"repo_id": self.repo_id, "query": query, "max_steps": max_steps},
        }

        for step_num in range(1, max_steps + 1):
            logger.debug("Agent [%s] starting Step %d / %d", self.repo_id, step_num, max_steps)
            try:
                result: LLMStepResult = await self.llm_client.generate_step(
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                )
            except Exception as e:
                logger.exception("LLM generation error at step %d: %s", step_num, e)
                final_answer = f"Investigation halted due to an LLM provider error: {str(e)}"
                yield {"event": "error", "data": {"error": str(e), "step": step_num}}
                break

            if result.is_tool_call and result.tool_name:
                tool_name = result.tool_name
                tool_args = result.tool_args or {}
                thought = result.content

                yield {
                    "event": "step_start",
                    "data": {
                        "step_number": step_num,
                        "thought": thought,
                        "tool_name": tool_name,
                        "tool_input": tool_args,
                    },
                }

                logger.debug("Step %d: calling tool '%s' with args %s", step_num, tool_name, tool_args)
                observation = self.tools.execute(tool_name, tool_args)

                # Record step
                step = AgentStep(
                    step_number=step_num,
                    thought=thought,
                    tool_name=tool_name,
                    tool_input=tool_args,
                    observation=observation,
                )
                steps.append(step)

                yield {
                    "event": "step_complete",
                    "data": step.model_dump(),
                }

                # Append to messages history in standard function-calling format
                call_id = f"call_{step_num}_{tool_name}"
                assistant_msg: Dict[str, Any] = {
                    "role": "assistant",
                    "content": thought or "",
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": json.dumps(tool_args),
                            },
                        }
                    ],
                }
                # Preserve raw provider response (e.g. Gemini thought_signature)
                if result.raw_response:
                    assistant_msg["_raw_gemini_content"] = result.raw_response
                messages.append(assistant_msg)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "name": tool_name,
                        "content": observation,
                    }
                )

            else:
                # Model concluded and produced a final answer
                final_answer = result.content or ""
                completed = True
                break

        # If max_steps reached without final answer, force synthesis
        if not completed and not final_answer:
            logger.info("Agent [%s] reached max_steps (%d). Forcing answer synthesis.", self.repo_id, max_steps)
            yield {"event": "synthesizing", "data": {"message": "Reached step limit. Synthesizing evidence..."}}
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "You have reached your maximum allocated investigation steps. "
                        "Synthesize your final answer now based on the code evidence and observations you have gathered.\n"
                        "Output format: Provide your detailed technical explanation. At the end, include a ```citations block containing a JSON array of per-claim citations with narrow, specific line ranges:\n"
                        "```citations\n"
                        "[\n"
                        '  {"file_path": "file/path.py", "start_line": 10, "end_line": 15, "claim": "Specific claim description", "symbol_name": "optional_symbol"}\n'
                        "]\n"
                        "```\n"
                        "Ensure each citation points to the specific lines backing that assertion (not the entire file slice)."
                    ),
                }
            )
            try:
                synthesis_result = await self.llm_client.generate_step(messages=messages, tools=[])
                final_answer = synthesis_result.content or "Maximum steps reached with partial evidence."
            except Exception as e:
                final_answer = f"Investigation concluded at step limit ({max_steps} steps). LLM synthesis note: {str(e)}"
        else:
            yield {"event": "synthesizing", "data": {"message": "Compiling structured code citations..."}}

        # Compile structured evidence citations (paired per-claim or from tool history)
        final_answer, evidence = self._extract_evidence(final_answer, steps)

        response = QueryResponse(
            repo_id=self.repo_id,
            query=query,
            answer=final_answer,
            evidence=evidence,
            steps=steps,
            total_steps=len(steps),
            completed=completed,
        )

        yield {
            "event": "complete",
            "data": response.model_dump(),
        }

    async def run(self, query: str, max_steps: int = 6) -> QueryResponse:
        """Run the multi-step investigation loop to answer the query."""
        last_response: Optional[QueryResponse] = None
        async for item in self.run_stream(query=query, max_steps=max_steps):
            if item["event"] == "complete":
                last_response = QueryResponse(**item["data"])

        if last_response:
            return last_response

        return QueryResponse(
            repo_id=self.repo_id,
            query=query,
            answer="Investigation terminated prematurely.",
            evidence=[],
            steps=[],
            total_steps=0,
            completed=False,
        )

