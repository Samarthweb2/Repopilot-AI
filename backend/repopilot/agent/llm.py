"""LLM client abstractions and providers for the RepoPilot agent."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("repopilot.agent.llm")


class LLMStepResult(BaseModel):
    """Result of a single LLM generation step in the agent loop."""

    content: Optional[str] = Field(
        default=None,
        description="Text content, reasoning, or final answer from the model.",
    )
    is_tool_call: bool = Field(
        default=False,
        description="True if the model decided to call a tool, False if it produced a final text answer.",
    )
    tool_name: Optional[str] = Field(
        default=None,
        description="Name of the tool requested by the model.",
    )
    tool_args: Dict[str, Any] = Field(
        default_factory=dict,
        description="Parsed argument dictionary for the requested tool.",
    )
    finish_reason: Optional[str] = Field(
        default=None,
        description="Finish reason returned by the model API (e.g. 'stop', 'tool_calls').",
    )
    raw_response: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Provider-specific raw content object to echo back verbatim (e.g. Gemini thought_signature).",
    )


class BaseLLMClient(ABC):
    """Abstract base class for LLM providers supporting function calling."""

    @abstractmethod
    async def generate_step(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ) -> LLMStepResult:
        """Generate the next agent step given conversation history and available tools."""
        pass


class MockLLMClient(BaseLLMClient):
    """Deterministic Mock LLM client for automated testing and offline development.

    Supports pre-scripted step sequences or intelligent rule-based agent progression.
    """

    def __init__(self, scripted_steps: Optional[List[LLMStepResult]] = None) -> None:
        self.scripted_steps: List[LLMStepResult] = list(scripted_steps) if scripted_steps else []
        self._call_count = 0

    def add_step(self, step: LLMStepResult) -> None:
        """Enqueue a scripted step."""
        self.scripted_steps.append(step)

    async def generate_step(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ) -> LLMStepResult:
        """Return next scripted step, or rule-based progression."""
        self._call_count += 1

        # 1. Use pre-scripted steps if available
        if self.scripted_steps:
            return self.scripted_steps.pop(0)

        # 2. Rule-based progression based on messages history
        last_msg = messages[-1] if messages else {}
        role = last_msg.get("role", "")
        content = str(last_msg.get("content", ""))

        if role == "user":
            # Initial step: invoke semantic search
            return LLMStepResult(
                content="I will search the codebase to identify relevant code chunks.",
                is_tool_call=True,
                tool_name="search_code",
                tool_args={"query": content, "limit": 3},
            )

        if role == "tool" and last_msg.get("name") == "search_code":
            # Second step: inspect specific file slice from search observation
            # Extract file and lines if present
            file_to_read = "main.py"
            start_l = 1
            end_l = 30
            if "File:" in content:
                try:
                    part = content.split("File:")[1].split()[0]
                    if ":" in part:
                        file_path_part, lines_part = part.split(":", 1)
                        file_to_read = file_path_part
                        if "-" in lines_part:
                            s, e = lines_part.split("-", 1)
                            start_l, end_l = int(s), int(e)
                except Exception:
                    pass

            return LLMStepResult(
                content=f"Examining {file_to_read} in detail to verify the exact logic.",
                is_tool_call=True,
                tool_name="read_file_slice",
                tool_args={"file_path": file_to_read, "start_line": start_l, "end_line": end_l},
            )

        # Final step: synthesize answer with narrow per-claim citations
        cited_file = "src/auth/service.py"
        cited_start = 8
        cited_end = 12
        for am in reversed(messages):
            if am.get("role") == "assistant" and am.get("tool_calls"):
                for tc in am["tool_calls"]:
                    if tc.get("function", {}).get("name") == "read_file_slice":
                        try:
                            args = json.loads(tc["function"].get("arguments", "{}"))
                            if "file_path" in args:
                                cited_file = args["file_path"]
                                orig_s = int(args.get("start_line", 1))
                                orig_e = int(args.get("end_line", orig_s + 10))
                                # Pick a narrow sub-range (e.g. 2 to 4 lines) inside the inspected slice
                                if (orig_e - orig_s) > 3:
                                    cited_start = orig_s + 2
                                    cited_end = min(orig_e, orig_s + 5)
                                else:
                                    cited_start = orig_s
                                    cited_end = orig_e
                        except Exception:
                            pass
                        break

        citations_json = json.dumps(
            [
                {
                    "file_path": cited_file,
                    "start_line": cited_start,
                    "end_line": cited_end,
                    "claim": f"Verification logic in {cited_file} enforces core validation rules.",
                    "symbol_name": "validate_token",
                }
            ],
            indent=2,
        )

        return LLMStepResult(
            content=(
                "Based on my investigation of the codebase:\n\n"
                "The requested logic is implemented in the repository. "
                "The components interact cleanly through standard configurations.\n\n"
                f"```citations\n{citations_json}\n```"
            ),
            is_tool_call=False,
            finish_reason="stop",
        )


class GeminiLLMClient(BaseLLMClient):
    """Google Gemini client via REST API with native Function Calling."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gemini-3.7-flash",
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model_name = model_name

    def _convert_tools_to_gemini(self, tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert standard JSON Schema tools to Gemini function declarations."""
        declarations = []
        for tool in tools:
            func = tool.get("function", {})
            declarations.append(
                {
                    "name": func.get("name"),
                    "description": func.get("description", ""),
                    "parameters": func.get("parameters", {}),
                }
            )
        return [{"function_declarations": declarations}] if declarations else []

    def _convert_messages_to_gemini(
        self, messages: List[Dict[str, Any]]
    ) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """Convert standard messages to Gemini system_instruction and contents format.

        When an assistant message carries a ``_raw_gemini_content`` key (the
        verbatim ``content`` object from a prior Gemini response), it is echoed
        back unchanged.  This preserves opaque fields such as
        ``thought_signature`` that Gemini 3.x requires for multi-turn function
        calling.
        """
        system_instruction = None
        contents = []

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "")

            if role == "system":
                system_instruction = {"parts": [{"text": str(content)}]}
            elif role == "user":
                contents.append({"role": "user", "parts": [{"text": str(content)}]})
            elif role == "assistant":
                # If the raw Gemini content object is available, use it
                # verbatim so that thought_signature is preserved.
                raw = msg.get("_raw_gemini_content")
                if raw:
                    contents.append(raw)
                else:
                    parts = []
                    if content:
                        parts.append({"text": str(content)})
                    if msg.get("tool_calls"):
                        for tc in msg["tool_calls"]:
                            func = tc.get("function", {})
                            parts.append(
                                {
                                    "functionCall": {
                                        "name": func.get("name"),
                                        "args": (
                                            json.loads(func.get("arguments", "{}"))
                                            if isinstance(func.get("arguments"), str)
                                            else func.get("arguments", {})
                                        ),
                                    }
                                }
                            )
                    if parts:
                        contents.append({"role": "model", "parts": parts})
            elif role == "tool":
                # Function response in Gemini
                name = msg.get("name", "tool")
                contents.append(
                    {
                        "role": "user",
                        "parts": [
                            {
                                "functionResponse": {
                                    "name": name,
                                    "response": {"output": str(content)},
                                }
                            }
                        ],
                    }
                )

        return system_instruction, contents

    async def generate_step(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ) -> LLMStepResult:
        if not self.api_key:
            raise ValueError(
                "GEMINI_API_KEY is not set. Please set the GEMINI_API_KEY environment variable."
            )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent?key={self.api_key}"
        system_inst, contents = self._convert_messages_to_gemini(messages)
        gemini_tools = self._convert_tools_to_gemini(tools)

        payload: Dict[str, Any] = {"contents": contents}
        if system_inst:
            payload["system_instruction"] = system_inst
        if gemini_tools:
            payload["tools"] = gemini_tools

        async with httpx.AsyncClient(timeout=60.0) as client:
            max_retries = 3
            for attempt in range(max_retries):
                resp = await client.post(url, json=payload)
                if resp.status_code in (429, 503) and attempt < max_retries - 1:
                    wait = 4 * (attempt + 1)
                    if resp.status_code == 429:
                        try:
                            err = resp.json()
                            for d in err.get("error", {}).get("details", []):
                                if "retryDelay" in d:
                                    delay_str = d["retryDelay"].rstrip("s")
                                    wait = float(delay_str) + 1
                        except Exception:
                            pass
                    logger.info("Gemini %d response. Retrying in %.1fs (attempt %d/%d)", resp.status_code, wait, attempt + 1, max_retries)
                    await asyncio.sleep(wait)
                    continue
                if resp.status_code != 200:
                    raise RuntimeError(
                        f"Gemini API error ({resp.status_code}): {resp.text}"
                    )
                break

            data = resp.json()

        try:
            candidate = data.get("candidates", [])[0]
            content_obj = candidate.get("content", {})
            parts = content_obj.get("parts", [])

            logger.debug("Gemini response parts: %s", [list(p.keys()) for p in parts])

            text_parts = []
            for part in parts:
                if "functionCall" in part:
                    fc = part["functionCall"]
                    return LLMStepResult(
                        content=" ".join(text_parts).strip() if text_parts else None,
                        is_tool_call=True,
                        tool_name=fc.get("name"),
                        tool_args=fc.get("args", {}),
                        finish_reason="tool_calls",
                        raw_response=content_obj,
                    )
                elif "text" in part:
                    text_parts.append(part["text"])
                elif "thought" in part:
                    # Gemini 3.x thinking models emit thought parts;
                    # skip them for the primary answer but keep as fallback.
                    pass

            final_text = " ".join(text_parts).strip()

            # If model returned only thought parts with no text, extract
            # thought content as a last resort so the answer isn't empty.
            if not final_text:
                thought_parts = [p["thought"] for p in parts if "thought" in p and p["thought"]]
                if thought_parts:
                    final_text = " ".join(thought_parts).strip()
                    logger.debug("Using thought content as fallback answer (%d chars)", len(final_text))

            return LLMStepResult(
                content=final_text,
                is_tool_call=False,
                finish_reason=candidate.get("finishReason", "stop"),
            )
        except (IndexError, KeyError) as e:
            raise RuntimeError(f"Unexpected response format from Gemini: {data}") from e


class OpenAILLMClient(BaseLLMClient):
    """OpenAI-compatible client via REST API with tool_calls support."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gpt-4o-mini",
        base_url: str = "https://api.openai.com/v1",
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")

    async def generate_step(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ) -> LLMStepResult:
        if not self.api_key:
            raise ValueError(
                "OPENAI_API_KEY is not set. Please set the OPENAI_API_KEY environment variable."
            )

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload: Dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"OpenAI API error ({resp.status_code}): {resp.text}"
                )

            data = resp.json()

        try:
            choice = data.get("choices", [])[0]
            message = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "stop")

            if message.get("tool_calls"):
                first_call = message["tool_calls"][0]
                func = first_call.get("function", {})
                raw_args = func.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    args = {}

                return LLMStepResult(
                    content=message.get("content"),
                    is_tool_call=True,
                    tool_name=func.get("name"),
                    tool_args=args,
                    finish_reason="tool_calls",
                )

            return LLMStepResult(
                content=message.get("content", ""),
                is_tool_call=False,
                finish_reason=finish_reason,
            )
        except (IndexError, KeyError) as e:
            raise RuntimeError(f"Unexpected response format from OpenAI: {data}") from e


def get_llm_client(
    provider: Optional[str] = None,
    model_name: Optional[str] = None,
) -> BaseLLMClient:
    """Factory helper to instantiate the configured LLM client.

    Resolution order:
    1. Explicit provider argument ('gemini', 'openai', 'mock')
    2. REPOPILOT_LLM_PROVIDER environment variable
    3. Auto-detection based on available API keys (GEMINI_API_KEY -> OpenAI)
    4. Fallback to MockLLMClient if no API key is set
    """
    provider = (provider or os.environ.get("REPOPILOT_LLM_PROVIDER", "")).strip().lower()

    if provider == "mock":
        return MockLLMClient()

    if provider == "gemini" or (not provider and os.environ.get("GEMINI_API_KEY")):
        model = model_name or os.environ.get("REPOPILOT_LLM_MODEL", "gemini-3.7-flash")
        return GeminiLLMClient(model_name=model)

    if provider == "openai" or (not provider and os.environ.get("OPENAI_API_KEY")):
        model = model_name or os.environ.get("REPOPILOT_LLM_MODEL", "gpt-4o-mini")
        return OpenAILLMClient(model_name=model)

    # If no keys or unknown provider, return MockLLMClient
    logger.info("No LLM API keys detected; falling back to MockLLMClient.")
    return MockLLMClient()
