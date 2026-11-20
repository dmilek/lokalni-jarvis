from mcp.server.fastmcp import FastMCP

from assistant_core import AssistantCore


mcp = FastMCP(
    "Lokalni Jarvis",
    instructions=(
        "Koristi lokalne Jarvis alate za vrijeme, testove, build i dopuštene Git "
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


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
