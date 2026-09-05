"""Autonomous agent investigation loop for RepoPilot."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from repopilot.agent.llm import BaseLLMClient, LLMStepResult, get_llm_client
from repopilot.agent.models import AgentStep, EvidenceCitation, QueryResponse
from repopilot.tools.code_tools import TOOL_DEFINITIONS, CodebaseTools

logger = logging.getLogger("repopilot.agent.loop")

SYSTEM_PROMPT = """You are RepoPilot, an autonomous Senior Codebase Assistant.
Your mission is to thoroughly investigate and answer questions about this repository using verifiable code evidence.

WORKFLOW GUIDELINES:
1. Discover with search_code: If you do not know the exact file or symbol name, search semantically for key concepts, functions, or algorithms.
2. Target with lookup_symbol: If you need an exact function, class, or method declaration, look it up in the AST index.
3. Verify with read_file_slice: ALWAYS read the actual lines of code from disk to verify how the code works before forming your conclusions. Never guess or hallucinate code implementations.
4. Synthesize with citations: In your final answer, explain the architecture, mechanisms, and edge cases clearly. Reference the exact file paths and line numbers that prove your answer.
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

    def _extract_evidence(self, steps: List[AgentStep]) -> List[EvidenceCitation]:
        """Extract structured EvidenceCitation records from tool observation history."""
        evidence: List[EvidenceCitation] = []
        seen_ranges = set()

        # 1. Prioritize files explicitly read via read_file_slice
        for step in steps:
            if step.tool_name == "read_file_slice":
                file_path = step.tool_input.get("file_path", "")
                start_line = int(step.tool_input.get("start_line", 1))
                end_line = int(step.tool_input.get("end_line", 1))

                key = (file_path, start_line, end_line)
                if key in seen_ranges:
                    continue
                seen_ranges.add(key)

                # Extract snippet from repo disk
                full_path = self.target_dir / file_path.lstrip("/\\")
                snippet = ""
                if full_path.exists() and full_path.is_file():
                    try:
                        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                            lines = f.readlines()
                        selected = lines[max(0, start_line - 1) : min(len(lines), end_line)]
                        snippet = "".join(selected).strip()
                    except Exception:
                        snippet = step.observation

                evidence.append(
                    EvidenceCitation(
                        file_path=file_path,
                        start_line=start_line,
                        end_line=end_line,
                        code_snippet=snippet or step.observation[:300],
                        relevance_explanation=f"Inspected in Step {step.step_number} to verify logic.",
                    )
                )

        # 2. If no read_file_slice was called, extract from search_code observations
        if not evidence:
            for step in steps:
                if step.tool_name == "search_code":
                    obs = step.observation
                    for line in obs.splitlines():
                        if "File:" in line and "Symbol:" in line:
                            # Format: [1] File: requests/adapters.py:280-320 | Symbol: HTTPAdapter.send
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

        return evidence

    async def run(self, query: str, max_steps: int = 6) -> QueryResponse:
        """Run the multi-step investigation loop to answer the query."""
        max_steps = max(1, min(max_steps, 15))
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ]

        steps: List[AgentStep] = []
        completed = False
        final_answer = ""

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
                break

            if result.is_tool_call and result.tool_name:
                # Execute tool
                tool_name = result.tool_name
                tool_args = result.tool_args or {}
                thought = result.content

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

                # Append to messages history in standard function-calling format
                call_id = f"call_{step_num}_{tool_name}"
                messages.append(
                    {
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
                )
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
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "You have reached your maximum allocated investigation steps. "
                        "Synthesize your final answer now based on the code evidence and observations you have gathered. "
                        "Explicitly cite the file paths and line ranges you inspected."
                    ),
                }
            )
            try:
                synthesis_result = await self.llm_client.generate_step(messages=messages, tools=[])
                final_answer = synthesis_result.content or "Maximum steps reached with partial evidence."
            except Exception as e:
                final_answer = f"Investigation concluded at step limit ({max_steps} steps). LLM synthesis note: {str(e)}"

        # Compile structured evidence citations
        evidence = self._extract_evidence(steps)

        return QueryResponse(
            repo_id=self.repo_id,
            query=query,
            answer=final_answer,
            evidence=evidence,
            steps=steps,
            total_steps=len(steps),
            completed=completed,
        )
