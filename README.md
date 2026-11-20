# Lokalni Jarvis

Jarvis je web-aplikacija za lokalno računalo. Razgovor obrađuje lokalni Ollama
model; web-pretraga koristi DuckDuckGo, a trenutačne vremenske podatke
Open-Meteo.

## Pokretanje

Potrebni su Python 3.8+ i pokrenuta lokalna Ollama instalacija. Iz mape
projekta pokreni:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
cp config.example.json config.json
python jarvis_gui.py
```

Otvori [http://127.0.0.1:8000](http://127.0.0.1:8000). Terminal mora ostati
otvoren dok koristiš Jarvisa. Za gašenje servera pritisni `Ctrl+C`.

Ollama mora biti pokrenut. Ako se Jarvis ne može povezati, otvori Ollama
aplikaciju i provjeri instalirane modele naredbom `ollama list`.

## Promjena Ollama modela

1. Provjeri točan naziv instaliranog modela:

   ```bash
   ollama list
   ```

2. Ako željeni model nije na popisu, preuzmi ga. Primjer:

   ```bash
   ollama pull qwen:14b
   ```

3. U `config.json` promijeni vrijednost `ollama_model`, koristeći naziv i oznaku
   modela iz `ollama list`:

   ```json
   "ollama_model": "qwen:14b"
   ```

4. Zaustavi Jarvis s `Ctrl+C` i ponovno ga pokreni.

Trenutačni model postavljen u konfiguraciji je `qwen2.5-coder:latest`.

## Glasovni unos

Koristi Chrome ili Edge i dopusti pristup mikrofonu kada preglednik to zatraži.
Online prepoznavanje govora može slati audio pružatelju usluge preglednika;
Jarvis ga ne pohranjuje. Tekstualni unos radi u svim preglednicima.

## Što Jarvis može napraviti

Može razgovarati s Ollamom, reći lokalni datum i vrijeme, provjeriti vrijeme u
mjestu pitanjem poput `kakvo je vrijeme u Zagrebu`, prikazati 7-dnevnu prognozu,
pretražiti web naredbom `pretraži internet za ...` te otvoriti HTTP/HTTPS adresu.
Naziv mjesta za
vremensku prognozu šalje se Open-Meteu; web-pretraga šalje upit DuckDuckGo-u.
Dnevni pregled prikazuje prognozu i lokalno unesene obaveze pri prvom otvaranju
svakog dana. Obaveze se čuvaju u lokalnoj pohrani preglednika, a model, jezik
govora, tema i mjesto za prognozu spremaju se u lokalni `config.json`.
Dnevni pregled možeš otvoriti gumbom ili naredbom `otvori dnevni pregled`.
Obavezu možeš dodati porukom ili glasom naredbom poput `Dodaj obavezu:
nazvati liječnika sutra` ili `Podsjeti me da kupim kruh u ponedjeljak`.
Prepoznaju se relativni rokovi, dani u tjednu i datumi; ako rok nije naveden,
obaveza se sprema za danas.
Podržane radne naredbe su `otvori ovaj projekt u VSCode`, `pokreni testove`,
`pokreni build`, `git status` i `git log`. Git radnje podržavaju
`git commit "poruka"` i `git sync "poruka"`. Sinkronizacija najprije povlači
udaljene promjene rebaseom, zatim commitira sve staged promjene i šalje ih na
`origin/<trenutačna-grana>`. Ako rebase zaključa, commit i push se ne izvode.
Naredbe mogu otvoriti dopuštene
macOS aplikacije Safari, Chrome, Finder, Terminal i Visual Studio Code.
Jarvis ne izvršava proizvoljne terminalske naredbe niti mijenja datoteke.
Server sluša samo na ovom računalu (`127.0.0.1:8000`).

## MCP za GitHub Copilot

Za korištenje MCP servera u VS Codeu dodaj konfiguraciju u
`.vscode/mcp.json`. Putanja koristi virtualno okruženje iz gornjih uputa:

```json
{
  "servers": {
    "lokalni-jarvis": {
      "type": "stdio",
      "command": "${workspaceFolder}/.venv/bin/python",
      "args": ["${workspaceFolder}/jarvis_mcp.py"]
    }
  }
}
```

Server pokreće lokalni `jarvis_mcp.py` i nudi alate za vrijeme, testove, build,
Git status, commit i sigurnu sinkronizaciju.

Ako server treba ponovno pokrenuti:

```bash
python -m pip install -e .
python jarvis_mcp.py
```

Git MCP alati rade samo u Git repozitoriju s udaljenim `origin` remoteom.
Git sync prvo koristi `pull --rebase --autostash`, zatim commit i push; ne koristi
`push --force`, obriši grane niti proizvoljne terminalske naredbe.
