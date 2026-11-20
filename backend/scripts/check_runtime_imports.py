"""Every module the backend imports, anywhere in its code, resolves with only the runtime requirements installed.

The production image installs requirements.txt alone, so a package that only the development requirements bring in
(as httpx once was) imports fine in development and in tests, then stops the API from starting in production. Run
this in an environment made from requirements.txt alone:

    pip install -r requirements.txt && python scripts/check_runtime_imports.py

It reads imports from the code rather than running it, so an import inside a function is checked as well.
"""
import ast
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCAL = {"app", "alembic", "scripts", "__future__"}


def imported() -> dict[str, set[str]]:
    """Top-level module name -> the files that import it."""
    found: dict[str, set[str]] = {}
    for folder in ("app", "alembic", "scripts"):
        for path in (ROOT / folder).rglob("*.py"):
            for node in ast.walk(ast.parse(path.read_text(), str(path))):
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                    names = [node.module]
                else:
                    continue
                for name in names:
                    found.setdefault(name.split(".")[0], set()).add(str(path.relative_to(ROOT)))
    return found


def main() -> int:
    third_party = {name: files for name, files in imported().items()
                   if name not in sys.stdlib_module_names and name not in LOCAL}
    missing = {name: files for name, files in third_party.items() if importlib.util.find_spec(name) is None}
    for name, files in sorted(missing.items()):
        print(f"{name} is imported by {', '.join(sorted(files))} but is not installed by requirements.txt")
    if missing:
        return 1
    print(f"All {len(third_party)} third-party modules the backend imports come from requirements.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
