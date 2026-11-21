# Lokalni M.A.J.O.R.

M.A.J.O.R. je web-aplikacija za lokalno računalo. Razgovor obrađuje lokalni Ollama
model; web-pretraga koristi DuckDuckGo, a trenutačne vremenske podatke
Open-Meteo.

Ime asistenta nije unaprijed određeno. Svaki korisnik može unijeti svoje ime u
**Postavke → Ime asistenta**. Trenutačno naziv M.A.J.O.R. predstavlja samo
zadanu konfiguraciju aplikacije.

## Kompatibilnost s Pythonom

Projekt deklarira Python 3.8 ili noviji. CI testira Python 3.8–3.15, koristeći
najnovije dostupno izdanje svake manje verzije. MCP server zahtijeva Python
3.10 ili noviji.

## Pokretanje

Potrebni su Python 3.8+ i pokrenuta lokalna Ollama instalacija. MCP server
zahtijeva Python 3.10+. Iz mape projekta pokreni:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
cp config.example.json config.json
python jarvis_gui.py
```

Za ponovljivu instalaciju zaključanih verzija možeš koristiti `uv sync --locked`.

Otvori [http://127.0.0.1:8000](http://127.0.0.1:8000). Terminal mora ostati
otvoren dok koristiš M.A.J.O.R. Za gašenje servera pritisni `Ctrl+C`.

Ollama mora biti pokrenut. Ako se M.A.J.O.R. ne može povezati, otvori Ollama
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

4. Zaustavi M.A.J.O.R. s `Ctrl+C` i ponovno ga pokreni.

Trenutačni model postavljen u konfiguraciji je `qwen2.5-coder:latest`.

## Glasovni unos

Koristi Chrome ili Edge i dopusti pristup mikrofonu kada preglednik to zatraži.
U postavkama možeš odabrati hrvatski ili engleski jezik govora; isto odabrano
stanje koristi M.A.J.O.R. za sustavni prompt i lokalne tekstualne odgovore.
Online prepoznavanje govora može slati audio pružatelju usluge preglednika;
M.A.J.O.R. ga ne pohranjuje. Tekstualni unos radi u svim preglednicima.

## Što M.A.J.O.R. može napraviti

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
M.A.J.O.R. ne izvršava proizvoljne terminalske naredbe niti mijenja datoteke.
Server sluša samo na ovom računalu (`127.0.0.1:8000`).

## Automatski izbor Ollama modela i glasovna aktivacija

Postavke mogu odrediti brzi i kvalitetni model. Za kratke upite M.A.J.O.R.
može koristiti brzi model, a za kod, analizu i kompleksne zadatke kvalitetni
model. Automatski odabir može se isključiti.

Glasovna aktivacija može se uključiti u Postavkama. Nakon pritiska na `GOVORI`
asistent čeka aktivacijsku frazu, npr. `hej major`, pa šalje ostatak govora kao
naredbu. Trenutačni Web Speech API u Chromeu i Edgeu može obrađivati zvuk
online; M.A.J.O.R. ne pohranjuje snimku.

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
Nudi i dopuštene radnje: otvaranje Safari, Chrome, Finder, Terminala i Visual
Studio Codea te čitanje/popis datoteka unutar projekta. MCP ne dopušta
proizvoljne terminalske naredbe, izlaz iz direktorija projekta ili čitanje
datoteka većih od 20 KB kao jednog rezultata.

Ako server treba ponovno pokrenuti:

```bash
python -m pip install -e .
python jarvis_mcp.py
```

Git MCP alati rade samo u Git repozitoriju s udaljenim `origin` remoteom.
Git sync prvo koristi `pull --rebase --autostash`, zatim commit i push; ne koristi
`push --force`, obriši grane niti proizvoljne terminalske naredbe.

## SonarCloud analiza

Projekt je konfiguriran za [SonarCloud](https://sonarcloud.io/project/issues?id=dmilek_lokalni-jarvis).
Za slanje analize iz korijena projekta instaliraj SonarScanner CLI i postavi
SonarCloud token u varijablu okruženja `SONAR_TOKEN` (token nemoj spremati u
projekt):

```bash
brew install sonar-scanner
export SONAR_TOKEN="tvoj-sonarcloud-token"
sonar-scanner -Dsonar.token="$SONAR_TOKEN"
```

Analiza uključuje aplikacijski kod i testove, a preskače virtualna okruženja.

Za lokalna upozorenja tijekom rada u VS Codeu instaliraj ekstenziju
**SonarQube for IDE**, zatim u prikazu **SonarQube Setup → Connected Mode**
poveži SonarQube Cloud organizaciju `dmilek` i projekt
`dmilek_lokalni-jarvis`. Token unesi samo u VS Code; nemoj ga spremati u projekt
niti slati u chat. Nakon povezivanja ekstenzija automatski prikazuje nalaze u
**Problems**. Ta lokalna analiza ne šalje svaki nalaz u SonarCloud; za to i dalje
pokreni SonarScanner ili automatiziraj analizu u CI-ju.
