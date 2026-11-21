from mcp.server.fastmcp import FastMCP
from pathlib import Path

from assistant_core import AssistantCore


mcp = FastMCP(
    "M.A.J.O.R.",
    instructions=(
        "Koristi lokalne M.A.J.O.R. alate za vrijeme, testove, build i dopuštene Git "
        "operacije. Ne izmišljaj rezultate terminala i ne koristi force push."
    ),
)


def _assistant():
    return AssistantCore(
        "http://127.0.0.1:11434",
        "jarvis-coder-7b",
    )


@mcp.tool()
def weather(location: str) -> str:
    """Vrati trenutačno vrijeme za navedeno mjesto."""
    return _assistant().handle(f"kakvo je vrijeme u {location}")


@mcp.tool()
def weekly_weather(location: str) -> dict:
    """Vrati 7-dnevnu vremensku prognozu za navedeno mjesto."""
    return _assistant().get_weekly_weather(location)


@mcp.tool()
def run_tests() -> str:
    """Pokreni projektne unittest testove."""
    return _assistant().handle("pokreni testove")


@mcp.tool()
def run_build() -> str:
    """Pokreni lokalnu provjeru kompilacije Python izvora."""
    return _assistant().handle("pokreni build")


@mcp.tool()
def git_status() -> str:
    """Vrati trenutačni status Git repozitorija."""
    return _assistant().handle("git status")


@mcp.tool()
def git_commit(message: str) -> str:
    """Dodaj sve promjene i napravi normalni Git commit."""
    if not message.strip():
        raise ValueError("Commit poruka ne smije biti prazna.")
    return _assistant().handle(f'git commit "{message.strip()}"')


@mcp.tool()
def git_sync(message: str) -> str:
    """Pullaj rebaseom, commitaj i pushaj na trenutačnu udaljenu granu."""
    if not message.strip():
        raise ValueError("Commit poruka ne smije biti prazna.")
    return _assistant().handle(f'git sync "{message.strip()}"')


@mcp.tool()
def open_project_in_vscode() -> str:
    """Otvoriti ovaj projekt u Visual Studio Codeu."""
    return _assistant().handle("otvori ovaj projekt u VSCode")


ALLOWED_APPS = {
    "safari": "Safari",
    "chrome": "Google Chrome",
    "finder": "Finder",
    "terminal": "Terminal",
    "visual studio code": "Visual Studio Code",
}


@mcp.tool()
def open_allowed_app(app_name: str) -> str:
    """Otvoriti samo unaprijed dopuštenu macOS aplikaciju."""
    key = app_name.strip().casefold()
    if key not in ALLOWED_APPS:
        raise ValueError("Aplikacija nije na dopuštenoj listi.")
    return _assistant().handle(f"otvori {key}")


@mcp.tool()
def list_project_files(directory: str = "") -> list[str]:
    """Prikaži datoteke unutar projekta do 200 stavki. Potputanje mora ostati unutar projekta."""
    root = Path(__file__).resolve().parent
    target = (root / directory).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Putanja je izvan projekta.")
    if not target.exists() or not target.is_dir():
        raise ValueError("Mapa projekta ne postoji.")
    entries = sorted(
        str(path.relative_to(root))
        for path in target.iterdir()
        if not path.name.startswith(".")
        and "venv" not in path.parts
        and "__pycache__" not in path.parts
    )
    return entries[:200]


@mcp.tool()
def read_project_file(path: str) -> str:
    """Pročitaj jednu tekstualnu datoteku projekta, najviše 20 KB."""
    root = Path(__file__).resolve().parent
    target = (root / path).resolve()
    if target != root and root not in target.parents:
        raise ValueError("Putanja je izvan projekta.")
    if not target.is_file():
        raise ValueError("Datoteka ne postoji.")
    data = target.read_text(encoding="utf-8")
    if len(data) > 20_000:
        raise ValueError("Datoteka je veća od 20 KB.")
    return data


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
