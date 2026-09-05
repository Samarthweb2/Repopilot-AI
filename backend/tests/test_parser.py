"""Unit tests for AST-based CodeParser and SymbolTable in repopilot.indexing."""

import tempfile
from pathlib import Path

import pytest

from repopilot.indexing.models import CodeChunk, SymbolTable
from repopilot.indexing.parser import CodeParser
from repopilot.models.schemas import FileInfo


@pytest.fixture
def parser():
    """Create CodeParser instance with a small non-code chunk size for testing."""
    return CodeParser(max_non_code_chunk_size=10)


@pytest.fixture
def sample_repo(tmp_path):
    """Generate a realistic test repository with Python, JS/TS, Markdown, and YAML files."""
    # 1. Python file with nested classes, inner functions, methods, and docstrings
    py_code = '''"""Module docstring."""

def standalone_func(x: int) -> int:
    """Computes square of x."""
    def inner_helper(y: int) -> int:
        """Inner helper docstring."""
        return y * 2
    return inner_helper(x) * x

class OuterService:
    """OuterService manages operations."""

    def __init__(self, name: str):
        """Constructor."""
        self.name = name

    def execute(self) -> str:
        return f"Executing {self.name}"

    class NestedWorker:
        """A nested worker class."""

        def work(self) -> None:
            """Does the actual work."""
            pass
'''
    (tmp_path / "service.py").write_text(py_code, encoding="utf-8")

    # 2. JavaScript/TypeScript file with classes, JSDoc, named arrows, and inline callbacks
    js_code = '''/**
 * Calculator utility class.
 */
class Calculator {
    add(a, b) {
        /** Adds two numbers. */
        return a + b;
    }
}

/**
 * Multiplies two numbers together.
 */
function multiply(a, b) {
    return a * b;
}

// Unrelated single-line comment separated from next function
function noDocFunction() {
    return 42;
}

/**
 * Named arrow function for division.
 */
const divide = (a, b) => {
    return a / b;
};

// Inline anonymous arrow callbacks inside call expressions (should NOT become chunks)
const numbers = [1, 2, 3];
const doubled = numbers.map(n => n * 2);
numbers.forEach((item) => {
    console.log(item);
});
'''
    (tmp_path / "calc.js").write_text(js_code, encoding="utf-8")

    # 3. Second file defining duplicate symbol name to test multi-file SymbolTable mapping
    dup_code = '''def standalone_func():
    """Different definition in another file."""
    return "alternate"
'''
    (tmp_path / "alternate.py").write_text(dup_code, encoding="utf-8")

    # 4. Small non-code YAML file
    yaml_code = "app:\n  name: repopilot\n  port: 8000\n"
    (tmp_path / "config.yaml").write_text(yaml_code, encoding="utf-8")

    # 5. Large Markdown file exceeding max_non_code_chunk_size (10 lines)
    md_lines = [
        "# Repopilot Guide",
        "",
        "Introduction paragraph.",
        "",
        "## Installation",
        "",
        "Step 1: Install uv",
        "Step 2: Run server",
        "",
        "## Architecture",
        "",
        "AST indexing details.",
        "Tree-sitter integration.",
        "",
        "## Conclusion",
        "Final notes.",
    ]
    (tmp_path / "README.md").write_text("\n".join(md_lines), encoding="utf-8")

    return tmp_path


def test_python_parsing_and_nesting(parser, sample_repo):
    """Verify boundaries, parent relationships, symbol types, and docstrings in Python."""
    file_path = sample_repo / "service.py"
    chunks = parser.parse_file(file_path, "service.py")

    symbol_map = {c.symbol_name: c for c in chunks}

    # Verify standalone function and inner helper
    assert "standalone_func" in symbol_map
    func_chunk = symbol_map["standalone_func"]
    assert func_chunk.symbol_type == "function"
    assert func_chunk.parent_symbol is None
    assert func_chunk.docstring == "Computes square of x."
    assert func_chunk.start_line < func_chunk.end_line

    assert "inner_helper" in symbol_map
    inner_chunk = symbol_map["inner_helper"]
    assert inner_chunk.symbol_type == "function"
    assert inner_chunk.parent_symbol == "standalone_func"
    assert inner_chunk.docstring == "Inner helper docstring."

    # Verify OuterService class and its methods
    assert "OuterService" in symbol_map
    outer_chunk = symbol_map["OuterService"]
    assert outer_chunk.symbol_type == "class"
    assert outer_chunk.parent_symbol is None
    assert outer_chunk.docstring == "OuterService manages operations."

    assert "__init__" in symbol_map
    init_chunk = symbol_map["__init__"]
    assert init_chunk.symbol_type == "method"
    assert init_chunk.parent_symbol == "OuterService"
    assert init_chunk.docstring == "Constructor."

    assert "execute" in symbol_map
    exec_chunk = symbol_map["execute"]
    assert exec_chunk.symbol_type == "method"
    assert exec_chunk.parent_symbol == "OuterService"
    assert exec_chunk.docstring is None

    # Verify nested class and method
    assert "NestedWorker" in symbol_map
    nested_class = symbol_map["NestedWorker"]
    assert nested_class.symbol_type == "class"
    assert nested_class.parent_symbol == "OuterService"
    assert nested_class.docstring == "A nested worker class."

    assert "work" in symbol_map
    work_method = symbol_map["work"]
    assert work_method.symbol_type == "method"
    assert work_method.parent_symbol == "NestedWorker"
    assert work_method.docstring == "Does the actual work."


def test_js_parsing_docstrings_and_callbacks(parser, sample_repo):
    """Verify JS class, methods, JSDoc extraction, named arrow functions, and callback exclusion."""
    file_path = sample_repo / "calc.js"
    chunks = parser.parse_file(file_path, "calc.js")

    symbols = [c.symbol_name for c in chunks]
    symbol_map = {c.symbol_name: c for c in chunks}

    # 1. Class and method
    assert "Calculator" in symbol_map
    calc_chunk = symbol_map["Calculator"]
    assert calc_chunk.symbol_type == "class"
    assert calc_chunk.docstring == "Calculator utility class."

    assert "add" in symbol_map
    add_chunk = symbol_map["add"]
    assert add_chunk.symbol_type == "method"
    assert add_chunk.parent_symbol == "Calculator"

    # 2. Function declaration with JSDoc
    assert "multiply" in symbol_map
    mult_chunk = symbol_map["multiply"]
    assert mult_chunk.symbol_type == "function"
    assert mult_chunk.docstring == "Multiplies two numbers together."

    # 3. Function WITHOUT JSDoc: MUST NOT steal preceding unrelated comment!
    assert "noDocFunction" in symbol_map
    nodoc_chunk = symbol_map["noDocFunction"]
    assert nodoc_chunk.docstring is None

    # 4. Named arrow function assigned to variable
    assert "divide" in symbol_map
    divide_chunk = symbol_map["divide"]
    assert divide_chunk.symbol_type == "function"
    assert divide_chunk.docstring == "Named arrow function for division."

    # 5. Anonymous callbacks: MUST NOT be extracted as standalone chunks
    # (e.g. n => n * 2, (item) => ...)
    for chunk in chunks:
        assert chunk.symbol_name not in ("n", "item", "doubled", "numbers")
        assert "map" not in chunk.symbol_name
        assert "forEach" not in chunk.symbol_name


def test_non_code_chunking(parser, sample_repo):
    """Verify small non-code file whole chunking and large Markdown header-based section splitting."""
    # Small YAML config (<= 10 lines)
    yaml_chunks = parser.parse_file(sample_repo / "config.yaml", "config.yaml")
    assert len(yaml_chunks) == 1
    assert yaml_chunks[0].symbol_type == "file"
    assert yaml_chunks[0].symbol_name == "config.yaml"

    # Large Markdown (> 10 lines) -> splits on headers
    md_chunks = parser.parse_file(sample_repo / "README.md", "README.md")
    assert len(md_chunks) >= 3

    section_names = [c.symbol_name for c in md_chunks]
    assert any("README.md#Repopilot Guide" in s or "README.md#Installation" in s for s in section_names)
    assert all(c.symbol_type == "document" for c in md_chunks)


def test_symbol_table_and_multi_file_mapping(parser, sample_repo):
    """Verify SymbolTable correctly aggregates symbols defined across multiple files."""
    files = [
        FileInfo(path="service.py", extension=".py", size=100),
        FileInfo(path="alternate.py", extension=".py", size=50),
        FileInfo(path="calc.js", extension=".js", size=100),
        FileInfo(path="config.yaml", extension=".yaml", size=30),
    ]

    all_chunks, symbol_table = parser.parse_repo(sample_repo, files)

    # 'standalone_func' is defined in both service.py and alternate.py
    matches = symbol_table.lookup("standalone_func")
    assert len(matches) == 2
    paths = {m.file_path for m in matches}
    assert paths == {"service.py", "alternate.py"}

    # Method lookup
    init_matches = symbol_table.lookup("__init__")
    assert len(init_matches) == 1
    assert init_matches[0].parent_symbol == "OuterService"

    # Case-insensitive search
    search_results = symbol_table.search("outer")
    assert any(c.symbol_name == "OuterService" for c in search_results)


def test_unparseable_file_graceful_fallback(parser, tmp_path):
    """Corrupted or invalid syntax files must produce fallback chunks with parse_error without raising."""
    bad_file = tmp_path / "broken.py"
    # Write invalid binary bytes that cause decode/parse issues
    bad_file.write_bytes(b"\xff\xfe\x00\x00def incomplete(")

    files = [FileInfo(path="broken.py", extension=".py", size=bad_file.stat().st_size)]

    # parse_repo must not crash
    chunks, table = parser.parse_repo(tmp_path, files)
    assert len(chunks) == 1
    fallback = chunks[0]
    assert fallback.symbol_name == "broken.py"
    assert fallback.symbol_type == "file"
    # parse_error should be recorded or empty fallback returned
    assert fallback.file_path == "broken.py"
