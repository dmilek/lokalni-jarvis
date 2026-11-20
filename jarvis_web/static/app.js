const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const messages = document.querySelector("#messages");
const statusMessage = document.querySelector("#status");
const sendButton = document.querySelector("#send-button");
const micButton = document.querySelector("#mic-button");
const micLabel = document.querySelector("#mic-label");
const weatherForm = document.querySelector("#weather-form");
const weatherLocationInput = document.querySelector("#weather-location-input");
const weatherLocation = document.querySelector("#weather-location");
const weatherSummary = document.querySelector("#weather-summary");
const weatherStatus = document.querySelector("#weather-status");
const weatherForecast = document.querySelector("#weather-forecast");
const weeklyWeatherButton = document.querySelector("#weekly-weather-button");
const settingsOpenButton = document.querySelector("#settings-open-button");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsModel = document.querySelector("#settings-model");
const settingsLanguage = document.querySelector("#settings-language");
const settingsTheme = document.querySelector("#settings-theme");
const settingsLocation = document.querySelector("#settings-location");
const settingsStatus = document.querySelector("#settings-status");
const briefingOpenButton = document.querySelector("#briefing-open-button");
const tasksOpenButton = document.querySelector("#tasks-open-button");
const tasksDialog = document.querySelector("#tasks-dialog");
const taskForm = document.querySelector("#task-form");
const taskTitleInput = document.querySelector("#task-title");
const taskDueDateInput = document.querySelector("#task-due-date");
const taskStatus = document.querySelector("#tasks-status");
const taskList = document.querySelector("#task-list");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let isBusy = false;
let isListening = false;
let recognition = null;
let tasks = [];
let tasksLoadError = false;
let dailyBriefingCard = null;
let latestForecastDay = null;
let forecastLoadError = false;

const TASKS_STORAGE_KEY = "jarvis.tasks";
const BRIEFING_DATE_STORAGE_KEY = "jarvis.briefing-date";

function setStatus(message, state = "ready") {
  statusMessage.textContent = message;
  statusMessage.dataset.state = state;
}

function appendLinkedText(element, text) {
  const urlPattern = /https?:\/\/[^\s]+/g;
  let cursor = 0;

  for (const match of text.matchAll(urlPattern)) {
    element.append(document.createTextNode(text.slice(cursor, match.index)));
    let address = match[0];
    let punctuation = "";
    while (/[.,;:!?)]$/.test(address)) {
      punctuation = address.slice(-1) + punctuation;
      address = address.slice(0, -1);
    }

    try {
      const url = new URL(address);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = address;
        element.append(link);
      } else {
        element.append(document.createTextNode(address));
      }
    } catch {
      element.append(document.createTextNode(address));
    }

    element.append(document.createTextNode(punctuation));
    cursor = match.index + match[0].length;
  }

  element.append(document.createTextNode(text.slice(cursor)));
}

function addMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "TI" : "J";

  const content = document.createElement("div");
  content.className = "message-content";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent = role === "user" ? "TI" : "JARVIS";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  appendLinkedText(bubble, text);

  content.append(author, bubble);
  article.append(avatar, content);
  messages.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function localDateKey() {
  return dateKey(new Date());
}

function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function createTask(title, dueDate) {
  const id = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, title, dueDate, done: false };
}

function dateAfterDays(days) {
  if (!Number.isInteger(days) || days < 0 || days > 3650) {
    return null;
  }
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function findTaskDueDate(text) {
  const candidates = [];
  const addCandidate = (pattern, resolveDate) => {
    const match = pattern.exec(text);
    if (match) {
      candidates.push({
        index: match.index,
        phrase: match[0],
        dueDate: resolveDate(match),
      });
    }
  };
  const deadlinePrefix = "(?:(?:rok|do)\\s+(?:je\\s+)?)?";

  addCandidate(new RegExp(`${deadlinePrefix}(prekosutra|sutra|danas)\\b`, "iu"), (match) =>
    dateAfterDays({ danas: 0, sutra: 1, prekosutra: 2 }[match[1].toLocaleLowerCase("hr-HR")])
  );
  addCandidate(/\bza\s+(\d{1,3})\s+dan(?:a)?\b/iu, (match) =>
    dateAfterDays(Number(match[1]))
  );
  addCandidate(
    new RegExp(`${deadlinePrefix}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`, "iu"),
    (match) => {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return dateKey(date) === match[0].slice(-10) ? dateKey(date) : null;
    }
  );
  addCandidate(
    new RegExp(`${deadlinePrefix}\\b(\\d{1,2})\\.\\s*(\\d{1,2})\\.(?:\\s*(\\d{4}))?(?!\\d)`, "iu"),
    (match) => {
      const today = localDateKey();
      let year = Number(match[3] || today.slice(0, 4));
      let date = new Date(year, Number(match[2]) - 1, Number(match[1]));
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== Number(match[2]) - 1 ||
        date.getDate() !== Number(match[1])
      ) {
        return null;
      }
      if (!match[3] && dateKey(date) < today) {
        year += 1;
        date = new Date(year, Number(match[2]) - 1, Number(match[1]));
      }
      return dateKey(date);
    }
  );

  const weekdayNames = {
    ponedjeljak: 1,
    ponedjeljka: 1,
    utorak: 2,
    utorka: 2,
    srijeda: 3,
    srijedu: 3,
    srijedom: 3,
    četvrtak: 4,
    četvrtka: 4,
    petak: 5,
    petka: 5,
    subota: 6,
    subotu: 6,
    subotom: 6,
    nedjelja: 0,
    nedjelju: 0,
    nedjeljom: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  };
  addCandidate(
    /(?:^|[\s,])(?:(?:u|on)\s+)?(ponedjeljak|ponedjeljka|utorak|utorka|srijeda|srijedu|srijedom|četvrtak|četvrtka|petak|petka|subota|subotu|subotom|nedjelja|nedjelju|nedjeljom|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?=$|[\s,.!?])/iu,
    (match) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      const targetDay = weekdayNames[match[1].toLocaleLowerCase("hr-HR")];
      let daysUntil = (targetDay - date.getDay() + 7) % 7;
      if (daysUntil === 0) {
        daysUntil = 7;
      }
      date.setDate(date.getDate() + daysUntil);
      return dateKey(date);
    }
  );

  candidates.sort((left, right) => left.index - right.index);
  return candidates[0] || null;
}

function parseTaskCommand(message) {
  const normalized = message.trim().replace(/^jarvis[,\s]+/iu, "");
  const commandPatterns = [
    /^(?:dodaj|spremi|zapiši|zabilježi|upiši|stavi)\s+(?:(?:mi\s+)?(?:u\s+(?:moj(?:em)?\s+)?(?:popis|listu)\s+)?(?:obavezu|obaveze|zadatak|zadatke))\s*[:,—–-]?\s*(.*)$/iu,
    /^podsjeti\s+me(?:\s+da)?\s*(.*)$/iu,
    /^(?:nemoj\s+zaboraviti|ne\s+zaboravi|zapamti)(?:\s+da)?\s*(.*)$/iu,
    /^(?:remind\s+me(?:\s+to)?|add\s+(?:a\s+)?(?:task|reminder)\s*[:,—–-]?)\s*(.*)$/iu,
  ];
  const match = commandPatterns.map((pattern) => normalized.match(pattern)).find(Boolean);
  if (!match) {
    return null;
  }

  let title = match[1].trim();
  if (!title) {
    return { error: "Napiši što treba napraviti pa ću dodati obavezu." };
  }

  const dueDate = findTaskDueDate(title);
  if (dueDate) {
    if (!dueDate.dueDate) {
      return { error: "Datum roka nije valjan. Provjeri datum i pokušaj ponovno." };
    }
    title = title.replace(dueDate.phrase, " ");
  }
  title = title
    .replace(/^\s*(?:da|to)\s+/iu, "")
    .replace(/\b(?:rok|do)\s*$/iu, "")
    .replace(/^[\s,:;—–-]+|[\s,:;.!?—–-]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return { error: "Napiši opis obaveze pa ću je dodati." };
  }
  if (title.length > 100) {
    return { error: "Opis obaveze mora imati najviše 100 znakova." };
  }

  return { title, dueDate: dueDate?.dueDate || localDateKey() };
}

function isDailyBriefingCommand(message) {
  const normalized = message
    .trim()
    .replace(/^jarvis[,\s]+/iu, "")
    .replace(/[.!?]+$/u, "");
  return /^(?:(?:molim te\s+)?(?:otvori|prikaži|prikazi|pokaži|pokazi)\s+(?:mi\s+)?(?:moj\s+)?dnevni\s+pregled|(?:open|show)\s+(?:my\s+)?daily\s+overview)$/iu.test(
    normalized
  );
}

function setTaskStatus(message, state = "ready") {
  taskStatus.textContent = message;
  taskStatus.dataset.state = state;
}

function loadTasks() {
  try {
    const stored = localStorage.getItem(TASKS_STORAGE_KEY);
    if (stored === null) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (
      !Array.isArray(parsed) ||
      parsed.some((task) =>
        !task ||
        typeof task.id !== "string" ||
        typeof task.title !== "string" ||
        typeof task.dueDate !== "string" ||
        typeof task.done !== "boolean"
      )
    ) {
      throw new Error("Neispravan format zadataka.");
    }
    return parsed;
  } catch (error) {
    tasksLoadError = true;
    setTaskStatus(
      error instanceof Error
        ? `Zadatke nije moguće učitati: ${error.message}`
        : "Zadatke nije moguće učitati iz lokalne pohrane.",
      "error"
    );
    return [];
  }
}

function saveTasks(updatedTasks) {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
  } catch (error) {
    setTaskStatus(
      error instanceof Error
        ? `Zadatak nije spremljen: ${error.message}`
        : "Zadatak nije moguće spremiti u lokalnu pohranu.",
      "error"
    );
    return false;
  }
  tasks = updatedTasks;
  tasksLoadError = false;
  renderTasks();
  updateDailyBriefingTasks();
  setTaskStatus("Obaveze su spremljene na ovom uređaju.");
  return true;
}

function renderTasks() {
  taskList.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.className = "task-list-empty";
    empty.textContent = tasksLoadError
      ? "Popis zadataka nije dostupan."
      : "Još nema spremljenih obaveza.";
    taskList.append(empty);
    return;
  }

  const orderedTasks = [...tasks].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate)
  );
  for (const task of orderedTasks) {
    const row = document.createElement("li");
    row.className = "task-row";
    row.dataset.done = String(task.done);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.dataset.taskId = task.id;
    checkbox.setAttribute("aria-label", `Označi kao gotovo: ${task.title}`);

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const dueDate = document.createElement("span");
    dueDate.className = "task-due-date";
    dueDate.textContent = formatForecastDate(task.dueDate);

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.dataset.taskId = task.id;
    remove.setAttribute("aria-label", `Obriši zadatak: ${task.title}`);
    remove.textContent = "×";

    row.append(checkbox, title, dueDate, remove);
    taskList.append(row);
  }
}

function updateDailyBriefingWeather() {
  if (!dailyBriefingCard) {
    return;
  }
  const weather = dailyBriefingCard.querySelector(".daily-briefing-weather");
  if (!latestForecastDay) {
    weather.textContent = forecastLoadError
      ? "Dnevnu prognozu trenutačno nije moguće dohvatiti."
      : "Dnevna prognoza se učitava...";
    return;
  }
  weather.textContent =
    `Vrijeme u ${weatherLocation.textContent}: ${latestForecastDay.condition}, ` +
    `${Math.round(latestForecastDay.temperature_min)}° / ` +
    `${Math.round(latestForecastDay.temperature_max)}°C, ` +
    `${latestForecastDay.precipitation_probability}% mogućnost oborine.`;
}

function updateDailyBriefingTasks() {
  if (!dailyBriefingCard) {
    return;
  }
  const summary = dailyBriefingCard.querySelector(".daily-briefing-obligations");
  const list = dailyBriefingCard.querySelector(".daily-briefing-tasks");
  list.replaceChildren();
  if (tasksLoadError) {
    summary.textContent = "Lokalne obaveze nisu učitane. Provjeri popis obaveza.";
    return;
  }

  const today = localDateKey();
  const dueTasks = tasks
    .filter((task) => !task.done && task.dueDate <= today)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const overdueCount = dueTasks.filter((task) => task.dueDate < today).length;
  const todayCount = dueTasks.length - overdueCount;
  summary.textContent = dueTasks.length
    ? `Obaveze: ${todayCount} za danas, ${overdueCount} s isteklim rokom.`
    : "Nema otvorenih obaveza za danas.";

  for (const task of dueTasks.slice(0, 4)) {
    const item = document.createElement("li");
    item.textContent = task.dueDate < today
      ? `${task.title} (rok ${formatForecastDate(task.dueDate)})`
      : task.title;
    list.append(item);
  }
  if (dueTasks.length > 4) {
    const more = document.createElement("li");
    more.textContent = `i još ${dueTasks.length - 4}`;
    list.append(more);
  }
}

function showDailyBriefing(force = false) {
  if (!force) {
    try {
      if (localStorage.getItem(BRIEFING_DATE_STORAGE_KEY) === localDateKey()) {
        return;
      }
      localStorage.setItem(BRIEFING_DATE_STORAGE_KEY, localDateKey());
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Dnevni pregled nije moguće zapamtiti: ${error.message}`
          : "Dnevni pregled nije moguće zapamtiti u pregledniku.",
        "error"
      );
    }
  }

  if (!dailyBriefingCard) {
    dailyBriefingCard = document.createElement("article");
    dailyBriefingCard.className = "daily-briefing";

    const heading = document.createElement("div");
    heading.className = "daily-briefing-heading";
    const label = document.createElement("strong");
    label.textContent = "DNEVNI PREGLED";
    const date = document.createElement("span");
    date.className = "daily-briefing-date";
    date.textContent = new Intl.DateTimeFormat("hr-HR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    heading.append(label, date);

    const weather = document.createElement("p");
    weather.className = "daily-briefing-weather";
    const obligations = document.createElement("p");
    obligations.className = "daily-briefing-obligations";
    const list = document.createElement("ul");
    list.className = "daily-briefing-tasks";
    dailyBriefingCard.append(heading, weather, obligations, list);
    messages.append(dailyBriefingCard);
  }
  updateDailyBriefingWeather();
  updateDailyBriefingTasks();
  messages.scrollTop = messages.scrollHeight;
}

function setBusy(busy) {
  isBusy = busy;
  input.disabled = busy;
  sendButton.disabled = busy;
  micButton.disabled = busy || !SpeechRecognition;
}

async function loadWeather(location) {
  weatherStatus.textContent = "PROVJERA";
  weatherStatus.dataset.state = "working";
  try {
    const response = await fetch(
      `/api/weather?location=${encodeURIComponent(location)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Vrijeme nije moguće provjeriti.");
    }
    weatherLocation.textContent = location;
    weatherSummary.textContent = payload.reply;
    weatherForecast.hidden = true;
    weatherStatus.textContent = "AŽURNO";
    weatherStatus.dataset.state = "ready";
  } catch (error) {
    weatherSummary.textContent =
      error instanceof Error ? error.message : "Nepoznata greška.";
    weatherStatus.textContent = "GREŠKA";
    weatherStatus.dataset.state = "error";
  }
}

weatherForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const location = weatherLocationInput.value.trim();
  if (location) {
    loadWeather(location);
  }
});

function formatForecastDate(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  return new Intl.DateTimeFormat("hr-HR", {
    weekday: "short",
    day: "numeric",
  }).format(date);
}

function forecastIcon(condition) {
  const normalized = condition.toLocaleLowerCase("hr-HR");
  if (normalized.includes("snijeg")) {
    return "❄️";
  }
  if (
    normalized.includes("kiša") ||
    normalized.includes("rosulja") ||
    normalized.includes("pljusak") ||
    normalized.includes("oluja") ||
    normalized.includes("tuča")
  ) {
    return "🌧️";
  }
  if (normalized.includes("magla")) {
    return "🌫️";
  }
  if (normalized.includes("djelomično oblačno")) {
    return "🌤️";
  }
  if (normalized.includes("oblačno")) {
    return "☁️";
  }
  return "🌡️";
}

async function loadWeeklyWeather(location) {
  weatherStatus.textContent = "7 DANA";
  weatherStatus.dataset.state = "working";
  forecastLoadError = false;
  try {
    const response = await fetch(
      `/api/weather/forecast?location=${encodeURIComponent(location)}`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Tjedna prognoza nije dostupna.");
    }

    weatherLocation.textContent = payload.location;
    weatherSummary.textContent = `${payload.location}, ${payload.country}`;
    latestForecastDay = payload.days[0] || null;
    weatherForecast.replaceChildren();
    for (const day of payload.days) {
      const card = document.createElement("article");
      card.className = "forecast-day";

      const date = document.createElement("strong");
      date.textContent = formatForecastDate(day.date);
      const icon = document.createElement("span");
      icon.className = "forecast-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = forecastIcon(day.condition);
      const temperatures = document.createElement("span");
      temperatures.className = "forecast-temperatures";
      temperatures.textContent =
        `${Math.round(day.temperature_min)}° / ${Math.round(day.temperature_max)}°`;
      const condition = document.createElement("span");
      condition.className = "forecast-condition";
      condition.textContent = day.condition;
      const rain = document.createElement("span");
      rain.className = "forecast-rain";
      rain.textContent = `${day.precipitation_probability}% kiša`;

      card.append(date, icon, temperatures, condition, rain);
      weatherForecast.append(card);
    }
    weatherForecast.hidden = false;
    forecastLoadError = false;
    updateDailyBriefingWeather();
    weatherStatus.textContent = "TJEDNO";
    weatherStatus.dataset.state = "ready";
  } catch (error) {
    weatherForecast.hidden = true;
    latestForecastDay = null;
    forecastLoadError = true;
    updateDailyBriefingWeather();
    weatherSummary.textContent =
      error instanceof Error ? error.message : "Nepoznata greška.";
    weatherStatus.textContent = "GREŠKA";
    weatherStatus.dataset.state = "error";
  }
}

weeklyWeatherButton.addEventListener("click", () => {
  const location = weatherLocationInput.value.trim();
  if (location) {
    loadWeeklyWeather(location);
  }
});

async function loadSettings() {
  settingsStatus.textContent = "Učitavam postavke...";
  settingsStatus.dataset.state = "working";
  try {
    const response = await fetch("/api/settings");
    const settings = await response.json();
    if (!response.ok) {
      throw new Error(settings.error || "Postavke nije moguće učitati.");
    }

    settingsLanguage.value = settings.speech_language;
    settingsTheme.value = settings.theme;
    settingsLocation.value = settings.weather_location;
    settingsModel.replaceChildren();
    const currentModel = document.createElement("option");
    currentModel.value = settings.ollama_model;
    currentModel.textContent = `${settings.ollama_model} (trenutačni model)`;
    settingsModel.append(currentModel);

    const modelsResponse = await fetch("/api/models");
    const modelsPayload = await modelsResponse.json();
    if (!modelsResponse.ok) {
      throw new Error(modelsPayload.error || "Popis modela nije dostupan.");
    }
    if (!Array.isArray(modelsPayload.models)) {
      throw new Error("Ollama je vratila neispravan popis modela.");
    }

    const modelNames = new Set(modelsPayload.models);
    settingsModel.replaceChildren();
    if (!modelNames.has(settings.ollama_model)) {
      settingsModel.append(currentModel);
    }
    for (const model of modelsPayload.models) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      settingsModel.append(option);
    }
    settingsModel.value = settings.ollama_model;
    settingsStatus.textContent = modelsPayload.models.length
      ? "Odaberi postavke i spremi promjene."
      : "Ollama nema instaliranih modela; zadržan je trenutačni model.";
    settingsStatus.dataset.state = modelsPayload.models.length ? "ready" : "error";
  } catch (error) {
    settingsStatus.textContent =
      error instanceof Error ? error.message : "Postavke nije moguće učitati.";
    settingsStatus.dataset.state = "error";
  }
}

settingsOpenButton.addEventListener("click", () => {
  settingsDialog.showModal();
  loadSettings();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsStatus.textContent = "Spremam postavke...";
  settingsStatus.dataset.state = "working";
  const settings = {
    ollama_model: settingsModel.value,
    speech_language: settingsLanguage.value,
    weather_location: settingsLocation.value.trim(),
    theme: settingsTheme.value,
  };
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Postavke nije moguće spremiti.");
    }

    window.jarvisSpeechLanguage = payload.speech_language;
    if (recognition) {
      recognition.lang = payload.speech_language;
    }
    document.documentElement.dataset.theme = payload.theme;
    weatherLocationInput.value = payload.weather_location;
    weatherLocation.textContent = payload.weather_location;
    document.querySelectorAll(".model-name, .model-readout").forEach((element) => {
      element.textContent = payload.ollama_model;
      element.title = payload.ollama_model;
    });
    settingsDialog.close();
    loadWeeklyWeather(payload.weather_location);
  } catch (error) {
    settingsStatus.textContent =
      error instanceof Error ? error.message : "Postavke nije moguće spremiti.";
    settingsStatus.dataset.state = "error";
  }
});

tasksOpenButton.addEventListener("click", () => {
  tasksDialog.showModal();
  renderTasks();
});

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = taskTitleInput.value.trim();
  const dueDate = taskDueDateInput.value;
  if (!title || !dueDate) {
    setTaskStatus("Unesi opis zadatka i rok.", "error");
    return;
  }
  if (saveTasks([...tasks, createTask(title, dueDate)])) {
    taskTitleInput.value = "";
    taskDueDateInput.value = localDateKey();
    taskTitleInput.focus();
  }
});

taskList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[type='checkbox'][data-task-id]");
  if (!checkbox) {
    return;
  }
  saveTasks(
    tasks.map((task) =>
      task.id === checkbox.dataset.taskId
        ? { ...task, done: checkbox.checked }
        : task
    )
  );
});

taskList.addEventListener("click", (event) => {
  const remove = event.target.closest("button[data-task-id]");
  if (!remove) {
    return;
  }
  saveTasks(tasks.filter((task) => task.id !== remove.dataset.taskId));
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    button.closest("dialog").close();
  });
});

document.querySelectorAll("dialog.app-dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
});

briefingOpenButton.addEventListener("click", () => {
  showDailyBriefing(true);
});

function isFirstOpenToday() {
  const today = localDateKey();
  try {
    if (localStorage.getItem(BRIEFING_DATE_STORAGE_KEY) === today) {
      return false;
    }
    localStorage.setItem(BRIEFING_DATE_STORAGE_KEY, today);
    return true;
  } catch (error) {
    setStatus(
      error instanceof Error
        ? `Dnevni pregled nije moguće zapamtiti: ${error.message}`
        : "Dnevni pregled nije moguće zapamtiti u pregledniku.",
      "error"
    );
    return true;
  }
}

tasks = loadTasks();
taskDueDateInput.value = localDateKey();
renderTasks();
if (isFirstOpenToday()) {
  showDailyBriefing(true);
}
loadWeeklyWeather(weatherLocationInput.value.trim());

async function sendMessage(rawMessage, source = "text") {
  const message = rawMessage.trim();
  if (!message || isBusy) {
    return;
  }

  if (isDailyBriefingCommand(message)) {
    addMessage("user", message);
    input.value = "";
    const reply = "Otvaram dnevni pregled.";
    addMessage("assistant", reply);
    showDailyBriefing(true);
    setStatus(source === "voice" ? "Govor prepoznat · dnevni pregled otvoren" : "Dnevni pregled otvoren");
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.lang = window.jarvisSpeechLanguage || "hr-HR";
      window.speechSynthesis.speak(utterance);
    }
    input.focus();
    return;
  }

  const taskCommand = parseTaskCommand(message);
  if (taskCommand) {
    addMessage("user", message);
    input.value = "";
    let reply;

    if (taskCommand.error) {
      reply = taskCommand.error;
      setStatus(reply, "error");
    } else if (tasksLoadError) {
      reply = "Popis obaveza nije dostupan, zato nisam spremio novu obavezu.";
      setStatus(reply, "error");
    } else {
      const task = createTask(taskCommand.title, taskCommand.dueDate);
      if (saveTasks([...tasks, task])) {
        reply = `Dodao sam obavezu: ${task.title} (rok ${formatForecastDate(task.dueDate)}).`;
        setStatus(source === "voice" ? "Govor prepoznat · obaveza dodana" : "Obaveza dodana");
      } else {
        reply = taskStatus.textContent || "Obavezu nije moguće spremiti.";
        setStatus(reply, "error");
      }
    }

    addMessage("assistant", reply);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.lang = window.jarvisSpeechLanguage || "hr-HR";
      window.speechSynthesis.speak(utterance);
    }
    input.focus();
    return;
  }

  addMessage("user", message);
  input.value = "";
  setBusy(true);
  setStatus("Jarvis razmišlja...", "working");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || `Zahtjev nije uspio (${response.status}).`);
    }

    addMessage("assistant", payload.reply);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(payload.reply);
      utterance.lang = window.jarvisSpeechLanguage || "hr-HR";
      window.speechSynthesis.speak(utterance);
    }
    setStatus(source === "voice" ? "Govor prepoznat" : "Spreman");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nepoznata greška.";
    addMessage("assistant", "Pogreška: " + message);
    setStatus(message, "error");
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = window.jarvisSpeechLanguage || "hr-HR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    if (isBusy) {
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      isListening = true;
      micButton.classList.add("is-listening");
      micButton.setAttribute("aria-pressed", "true");
      micLabel.textContent = "Slušam...";
      setStatus("Slušam — izgovori naredbu.", "working");
    } catch (error) {
      setStatus("Mikrofon nije moguće pokrenuti. Pokušaj ponovno.", "error");
    }
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (transcript) {
      input.value = transcript;
      sendMessage(transcript, "voice");
    }
  });

  recognition.addEventListener("error", (event) => {
    const message = event.error === "not-allowed"
      ? "Dopusti pristup mikrofonu u pregledniku."
      : event.error === "no-speech"
        ? "Nije prepoznat govor. Pokušaj ponovno."
        : "Prepoznavanje govora nije uspjelo: " + event.error;
    setStatus(message, "error");
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micButton.classList.remove("is-listening");
    micButton.setAttribute("aria-pressed", "false");
    micLabel.textContent = "Govori";
    if (!isBusy && statusMessage.dataset.state === "working") {
      setStatus("Spreman");
    }
  });
} else {
  micButton.disabled = true;
  micButton.title = "Glasovni unos podržan je u Chromeu i Edgeu.";
  setStatus("Glasovni unos nije podržan u ovom pregledniku; možeš tipkati.");
}
