"""AST-based CodeParser for Repopilot AI using Tree-sitter."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import tree_sitter_languages

from repopilot.indexing.models import CodeChunk, SymbolTable
from repopilot.models.schemas import FileInfo

logger = logging.getLogger("repopilot.indexing")

# Mapping from file extensions to tree-sitter language identifiers
LANGUAGE_EXTENSION_MAP: Dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
}

# Recognized non-code or documentation extensions
NON_CODE_EXTENSIONS: Set[str] = {
    ".md", ".markdown", ".yaml", ".yml", ".json", ".toml",
    ".txt", ".rst", ".ini", ".cfg", ".conf", ".env", ".sh", ".bash",
}


def _clean_docstring(raw: str) -> str:
    """Clean and strip formatting from Python or JSDoc docstrings."""
    cleaned = raw.strip()
    # Python triple quotes
    if cleaned.startswith(('"""', "'''")):
        cleaned = cleaned[3:]
    if cleaned.endswith(('"""', "'''")):
        cleaned = cleaned[:-3]
    # JSDoc comment formatting
    if cleaned.startswith("/**"):
        cleaned = cleaned[3:]
    if cleaned.endswith("*/"):
        cleaned = cleaned[:-2]
    # Strip leading asterisks per line for JSDoc
    lines = [re.sub(r"^\s*\*\s?", "", line) for line in cleaned.splitlines()]
    return "\n".join(lines).strip()


class CodeParser:
    """Extracts semantic code chunks (classes, methods, functions) using Tree-sitter ASTs."""

    def __init__(self, max_non_code_chunk_size: int = 100) -> None:
        """Initialize parser with configurable non-code section chunk size limit (lines)."""
        self.max_non_code_chunk_size = max_non_code_chunk_size
        self._parsers: Dict[str, any] = {}

    def _get_parser(self, lang: str):
        """Lazily load and cache tree-sitter parsers."""
        if lang not in self._parsers:
            self._parsers[lang] = tree_sitter_languages.get_parser(lang)
        return self._parsers[lang]

    def parse_repo(
        self,
        repo_path: str | Path,
        files: List[FileInfo],
    ) -> Tuple[List[CodeChunk], SymbolTable]:
        """Parse all filtered files in a repository into CodeChunks and populate a SymbolTable.

        Never crashes the entire process on individual unparseable files;
        gracefully falls back to whole-file chunks with parse_error populated.
        """
        base_dir = Path(repo_path).resolve()
        all_chunks: List[CodeChunk] = []
        symbol_table = SymbolTable()

        for file_info in files:
            full_path = base_dir / file_info.path
            if not full_path.is_file():
                continue

            chunks = self.parse_file(full_path, file_info.path)
            for chunk in chunks:
                all_chunks.append(chunk)
                # Register named code symbols in the SymbolTable
                if chunk.symbol_type in ("function", "class", "method"):
                    symbol_table.add(chunk)

        return all_chunks, symbol_table

    def parse_file(self, full_path: Path, rel_path: str) -> List[CodeChunk]:
        """Parse an individual source or non-code file into semantic CodeChunks."""
        try:
            source_bytes = full_path.read_bytes()
        except Exception as e:
            logger.warning("Failed to read file %s: %s", rel_path, e)
            return [
                CodeChunk(
                    file_path=rel_path,
                    start_line=1,
                    end_line=1,
                    symbol_name=full_path.name,
                    symbol_type="file",
                    raw_code="",
                    parse_error=f"Could not read file: {str(e)}",
                )
            ]

        # Decode source
        try:
            source_code = source_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                source_code = source_bytes.decode("latin-1")
            except Exception as e:
                return [
                    CodeChunk(
                        file_path=rel_path,
                        start_line=1,
                        end_line=1,
                        symbol_name=full_path.name,
                        symbol_type="file",
                        raw_code="",
                        parse_error=f"Unicode decode error: {str(e)}",
                    )
                ]

        ext = full_path.suffix.lower()
        lang = LANGUAGE_EXTENSION_MAP.get(ext)

        # 1. Supported code language with Tree-sitter
        if lang:
            try:
                chunks = self._parse_ast(source_bytes, source_code, rel_path, lang)
                if chunks:
                    return chunks
            except Exception as e:
                logger.warning("Tree-sitter parse error in %s: %s", rel_path, e)
                lines = source_code.splitlines()
                return [
                    CodeChunk(
                        file_path=rel_path,
                        start_line=1,
                        end_line=max(1, len(lines)),
                        symbol_name=full_path.name,
                        symbol_type="file",
                        raw_code=source_code,
                        parse_error=f"AST parse error: {str(e)}",
                    )
                ]

        # 2. Non-code, documentation, or fallback files
        return self._chunk_non_code(source_code, rel_path, ext)

    def _parse_ast(
        self,
        source_bytes: bytes,
        source_code: str,
        rel_path: str,
        lang: str,
    ) -> List[CodeChunk]:
        """Parse source with tree-sitter and extract semantic nodes."""
        parser = self._get_parser(lang)
        tree = parser.parse(source_bytes)
        root = tree.root_node

        chunks: List[CodeChunk] = []
        lines = source_code.splitlines()

        if lang == "python":
            self._extract_python_nodes(root, source_code, rel_path, lines, parent_symbol=None, chunks=chunks)
        elif lang in ("javascript", "typescript", "tsx"):
            self._extract_js_ts_nodes(root, source_code, rel_path, lines, parent_symbol=None, chunks=chunks)

        return chunks

    # -------------------------------------------------------------------------
    # Python AST Node Extraction
    # -------------------------------------------------------------------------
    def _extract_python_nodes(
        self,
        node,
        source_code: str,
        rel_path: str,
        lines: List[str],
        parent_symbol: Optional[str],
        chunks: List[CodeChunk],
        parent_type: Optional[str] = None,
    ) -> None:
        """Traverse Python AST nodes and extract classes, methods, and functions."""
        for child in node.children:
            node_type = child.type

            if node_type == "class_definition":
                name_node = child.child_by_field_name("name")
                if not name_node:
                    continue
                class_name = name_node.text.decode("utf-8")
                start_line = child.start_point[0] + 1
                end_line = child.end_point[0] + 1
                raw_code = "\n".join(lines[start_line - 1 : end_line])
                docstring = self._extract_python_docstring(child)

                # Emit class chunk
                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=start_line,
                        end_line=end_line,
                        symbol_name=class_name,
                        symbol_type="class",
                        parent_symbol=parent_symbol,
                        docstring=docstring,
                        raw_code=raw_code,
                    )
                )

                # Recurse into class body to extract methods and nested classes
                body_node = child.child_by_field_name("body")
                if body_node:
                    self._extract_python_nodes(
                        body_node,
                        source_code,
                        rel_path,
                        lines,
                        parent_symbol=class_name,
                        chunks=chunks,
                        parent_type="class",
                    )

            elif node_type in ("function_definition", "async_function_definition"):
                name_node = child.child_by_field_name("name")
                if not name_node:
                    continue
                func_name = name_node.text.decode("utf-8")
                start_line = child.start_point[0] + 1
                end_line = child.end_point[0] + 1
                raw_code = "\n".join(lines[start_line - 1 : end_line])
                docstring = self._extract_python_docstring(child)

                # Method if inside a class, otherwise function (even if nested in another function)
                symbol_type = "method" if parent_type == "class" else "function"

                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=start_line,
                        end_line=end_line,
                        symbol_name=func_name,
                        symbol_type=symbol_type,
                        parent_symbol=parent_symbol,
                        docstring=docstring,
                        raw_code=raw_code,
                    )
                )

                # Recurse into function body to extract any inner functions/classes
                body_node = child.child_by_field_name("body")
                if body_node:
                    self._extract_python_nodes(
                        body_node,
                        source_code,
                        rel_path,
                        lines,
                        parent_symbol=func_name,
                        chunks=chunks,
                        parent_type="function",
                    )

    def _extract_python_docstring(self, func_or_class_node) -> Optional[str]:
        """Extract triple-quoted docstring from Python function or class body."""
        body_node = func_or_class_node.child_by_field_name("body")
        if not body_node:
            return None

        # Look for the first expression_statement containing a string in the body
        for child in body_node.children:
            if child.type == "expression_statement":
                for sub in child.children:
                    if sub.type == "string":
                        raw_text = sub.text.decode("utf-8")
                        return _clean_docstring(raw_text)
            elif child.type in ("comment", "pass"):
                continue
            else:
                break
        return None

    # -------------------------------------------------------------------------
    # JavaScript / TypeScript AST Node Extraction
    # -------------------------------------------------------------------------
    def _extract_js_ts_nodes(
        self,
        node,
        source_code: str,
        rel_path: str,
        lines: List[str],
        parent_symbol: Optional[str],
        chunks: List[CodeChunk],
    ) -> None:
        """Traverse JS/TS AST nodes and extract classes, functions, methods, and named arrow functions."""
        for child in node.children:
            node_type = child.type

            # Handle export statements wrapping declarations: export function ..., export default class ...
            if node_type in ("export_statement", "export_default_statement"):
                self._extract_js_ts_nodes(
                    child, source_code, rel_path, lines, parent_symbol=parent_symbol, chunks=chunks
                )
                continue

            # 1. Class declarations
            if node_type in ("class_declaration", "class"):
                name_node = child.child_by_field_name("name")
                if not name_node:
                    continue
                class_name = name_node.text.decode("utf-8")
                start_line = child.start_point[0] + 1
                end_line = child.end_point[0] + 1
                raw_code = "\n".join(lines[start_line - 1 : end_line])
                docstring = self._extract_js_ts_docstring(child, node)

                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=start_line,
                        end_line=end_line,
                        symbol_name=class_name,
                        symbol_type="class",
                        parent_symbol=parent_symbol,
                        docstring=docstring,
                        raw_code=raw_code,
                    )
                )

                # Recurse into class body
                body_node = child.child_by_field_name("body")
                if body_node:
                    self._extract_js_ts_class_body(
                        body_node, source_code, rel_path, lines, class_name, chunks
                    )

            # 2. Function declarations
            elif node_type in ("function_declaration", "function"):
                name_node = child.child_by_field_name("name")
                if not name_node:
                    continue
                func_name = name_node.text.decode("utf-8")
                start_line = child.start_point[0] + 1
                end_line = child.end_point[0] + 1
                raw_code = "\n".join(lines[start_line - 1 : end_line])
                docstring = self._extract_js_ts_docstring(child, node)

                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=start_line,
                        end_line=end_line,
                        symbol_name=func_name,
                        symbol_type="function",
                        parent_symbol=parent_symbol,
                        docstring=docstring,
                        raw_code=raw_code,
                    )
                )

                body_node = child.child_by_field_name("body")
                if body_node:
                    self._extract_js_ts_nodes(
                        body_node, source_code, rel_path, lines, parent_symbol=func_name, chunks=chunks
                    )

            # 3. Variable declarations assigned to arrow functions / function expressions
            # Example: const calculate = (a, b) => a + b;
            elif node_type in ("lexical_declaration", "variable_declaration"):
                for declarator in child.children:
                    if declarator.type == "variable_declarator":
                        name_node = declarator.child_by_field_name("name")
                        value_node = declarator.child_by_field_name("value")

                        if name_node and value_node and value_node.type in ("arrow_function", "function_expression", "function"):
                            func_name = name_node.text.decode("utf-8")
                            start_line = child.start_point[0] + 1
                            end_line = child.end_point[0] + 1
                            raw_code = "\n".join(lines[start_line - 1 : end_line])
                            docstring = self._extract_js_ts_docstring(child, node)

                            chunks.append(
                                CodeChunk(
                                    file_path=rel_path,
                                    start_line=start_line,
                                    end_line=end_line,
                                    symbol_name=func_name,
                                    symbol_type="function",
                                    parent_symbol=parent_symbol,
                                    docstring=docstring,
                                    raw_code=raw_code,
                                )
                            )

    def _extract_js_ts_class_body(
        self,
        class_body_node,
        source_code: str,
        rel_path: str,
        lines: List[str],
        class_name: str,
        chunks: List[CodeChunk],
    ) -> None:
        """Extract methods and field functions from a JS/TS class body."""
        for child in class_body_node.children:
            if child.type in ("method_definition", "public_field_definition", "field_definition"):
                name_node = child.child_by_field_name("name")
                if not name_node:
                    continue
                method_name = name_node.text.decode("utf-8")

                # For fields, only capture if value is a function
                if child.type != "method_definition":
                    value_node = child.child_by_field_name("value")
                    if not value_node or value_node.type not in ("arrow_function", "function_expression"):
                        continue

                start_line = child.start_point[0] + 1
                end_line = child.end_point[0] + 1
                raw_code = "\n".join(lines[start_line - 1 : end_line])
                docstring = self._extract_js_ts_docstring(child, class_body_node)

                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=start_line,
                        end_line=end_line,
                        symbol_name=method_name,
                        symbol_type="method",
                        parent_symbol=class_name,
                        docstring=docstring,
                        raw_code=raw_code,
                    )
                )

    def _extract_js_ts_docstring(self, target_node, parent_node) -> Optional[str]:
        """Extract strictly preceding JSDoc comments (`/** ... */`) immediately adjacent to the node.

        Returns None if no JSDoc comment exists within 1 line above the target node.
        """
        # Find index of target_node among parent's children
        children = parent_node.children
        try:
            idx = children.index(target_node)
        except ValueError:
            return None

        # Check previous sibling
        if idx > 0:
            prev_node = children[idx - 1]
            if prev_node.type == "comment":
                raw_comment = prev_node.text.decode("utf-8").strip()
                # Strict JSDoc requirement: must start with /**
                if raw_comment.startswith("/**"):
                    # Adjacency check: gap between end of comment and start of target must be <= 1 line
                    line_gap = target_node.start_point[0] - prev_node.end_point[0]
                    if line_gap <= 1:
                        return _clean_docstring(raw_comment)
        return None

    # -------------------------------------------------------------------------
    # Non-Code / Markdown / Fallback Chunking
    # -------------------------------------------------------------------------
    def _chunk_non_code(self, source_code: str, rel_path: str, ext: str) -> List[CodeChunk]:
        """Split documentation and config files into capped semantic chunks."""
        lines = source_code.splitlines()
        total_lines = len(lines)
        file_name = Path(rel_path).name

        if total_lines == 0:
            return []

        # If small enough, emit as a single chunk
        if total_lines <= self.max_non_code_chunk_size:
            return [
                CodeChunk(
                    file_path=rel_path,
                    start_line=1,
                    end_line=total_lines,
                    symbol_name=file_name,
                    symbol_type="document" if ext in (".md", ".markdown", ".rst") else "file",
                    raw_code=source_code,
                )
            ]

        # Markdown: split on headers (# , ## , ### )
        if ext in (".md", ".markdown"):
            return self._chunk_markdown_sections(lines, rel_path, file_name)

        # Other non-code files: split into sequential capped slices
        return self._chunk_sliced(lines, rel_path, file_name)

    def _chunk_markdown_sections(
        self, lines: List[str], rel_path: str, file_name: str
    ) -> List[CodeChunk]:
        """Split a large markdown document into section chunks based on markdown headings."""
        chunks: List[CodeChunk] = []
        current_section_lines: List[str] = []
        current_header = file_name
        section_start_line = 1

        for idx, line in enumerate(lines, start=1):
            header_match = re.match(r"^(#{1,4})\s+(.+)$", line.strip())
            if header_match and current_section_lines:
                # Emit previous section
                section_text = "\n".join(current_section_lines)
                chunks.append(
                    CodeChunk(
                        file_path=rel_path,
                        start_line=section_start_line,
                        end_line=idx - 1,
                        symbol_name=f"{file_name}#{current_header}",
                        symbol_type="document",
                        raw_code=section_text,
                    )
                )
                current_section_lines = [line]
                current_header = header_match.group(2).strip()
                section_start_line = idx
            else:
                if header_match:
                    current_header = header_match.group(2).strip()
                    section_start_line = idx
                current_section_lines.append(line)

        # Emit final section
        if current_section_lines:
            section_text = "\n".join(current_section_lines)
            chunks.append(
                CodeChunk(
                    file_path=rel_path,
                    start_line=section_start_line,
                    end_line=len(lines),
                    symbol_name=f"{file_name}#{current_header}",
                    symbol_type="document",
                    raw_code=section_text,
                )
            )

        return chunks

    def _chunk_sliced(
        self, lines: List[str], rel_path: str, file_name: str
    ) -> List[CodeChunk]:
        """Slice large files into sequential chunks capped at max_non_code_chunk_size lines."""
        chunks: List[CodeChunk] = []
        total_lines = len(lines)
        step = self.max_non_code_chunk_size

        for i in range(0, total_lines, step):
            slice_lines = lines[i : i + step]
            start_line = i + 1
            end_line = min(i + step, total_lines)
            part_num = (i // step) + 1
            chunks.append(
                CodeChunk(
                    file_path=rel_path,
                    start_line=start_line,
                    end_line=end_line,
                    symbol_name=f"{file_name}#part_{part_num}",
                    symbol_type="file",
                    raw_code="\n".join(slice_lines),
                )
            )

        return chunks
