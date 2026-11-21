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
const coreCpuValue = document.querySelector("#core-cpu-value");
const coreMemoryValue = document.querySelector("#core-memory-value");
const coreDataCpu = document.querySelector("#core-data-cpu");
const coreDataMemory = document.querySelector("#core-data-memory");
const coreDataDisk = document.querySelector("#core-data-disk");
const settingsOpenButton = document.querySelector("#settings-open-button");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsName = document.querySelector("#settings-name");
const settingsModel = document.querySelector("#settings-model");
const settingsFastModel = document.querySelector("#settings-fast-model");
const settingsQualityModel = document.querySelector("#settings-quality-model");
const settingsAutoRouting = document.querySelector("#settings-auto-routing");
const settingsWakeEnabled = document.querySelector("#settings-wake-enabled");
const settingsWakeWord = document.querySelector("#settings-wake-word");
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
let wakeListening = false;
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

function applyAssistantName(name) {
  if (!name) {
    return;
  }
  document.title = `Lokalni ${name}`;
  const brandTitle = document.querySelector(".brand h1");
  brandTitle.textContent = name;
  document.querySelectorAll(".message-author").forEach((element) => {
    const suffix = element.querySelector("span");
    element.replaceChildren(document.createTextNode(`${name} `));
    if (suffix) {
      element.append(suffix);
    }
  });
  const footerStatus = document.querySelector(".footer span");
  if (footerStatus) {
    const mark = document.createElement("span");
    mark.className = "footer-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "◆";
    footerStatus.replaceChildren(mark, document.createTextNode(` ${name} · RADI NA TVOM RAČUNALU`));
  }
  document.querySelector("#settings-title").textContent = "Postavke asistenta";
  document.querySelector(".conversation").setAttribute("aria-label", `Razgovor s ${name}`);
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
  avatar.textContent = role === "user" ? "TI" : "M";

  const content = document.createElement("div");
  content.className = "message-content";

  const author = document.createElement("span");
  author.className = "message-author";
  author.textContent =
    role === "user"
      ? "TI"
      : document.querySelector(".brand h1").textContent;

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
  let id;
  if (window.crypto?.randomUUID) {
    id = window.crypto.randomUUID();
  } else {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    id = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }
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
    /^(?:dodaj|spremi|zapiši|zabilježi|upiši|stavi)\s+(?:(?:mi\s+)?(?:u\s+(?:moj(?:em)?\s+)?(?:popis|listu)\s+)?(?:obavezu|obaveze|zadatak|zadatke|task|tasks))\s*[:,—–-]?\s*(.*)$/iu,
    /^podsjeti\s+me(?:\s+da)?\s*(.*)$/iu,
    /^(?:nemoj\s+zaboraviti|ne\s+zaboravi|zapamti)(?:\s+da)?\s*(.*)$/iu,
    /^(?:remind\s+me(?:\s+to)?|add\s+(?:a\s+)?(?:task|reminder)\s*[:,—–-]?)\s*(.*)$/iu,
    /^((?:odvesti|odnijeti|kupiti|nazvati|naručiti|otići|zakazati|platiti|obaviti|popraviti|pokupiti|spremiti|preuzeti|završiti|baciti|poslati|odraditi|napraviti|rezervirati|provjeriti|pokrenuti|dovesti|donijeti|podnijeti)\b.*)$/iu,
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
    .replace(/^\s*moram\s+/iu, "")
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
  const upcomingTasks = tasks
    .filter((task) => !task.done && task.dueDate > today)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const overdueCount = dueTasks.filter((task) => task.dueDate < today).length;
  const todayCount = dueTasks.length - overdueCount;
  if (dueTasks.length) {
    summary.textContent = `Obaveze: ${todayCount} za danas, ${overdueCount} s isteklim rokom.`;
  } else if (upcomingTasks.length) {
    summary.textContent = `Nema otvorenih obaveza za danas. Uskoro: ${upcomingTasks.length}.`;
  } else {
    summary.textContent = "Nema otvorenih obaveza za danas.";
  }

  const briefingTasks = [...dueTasks, ...upcomingTasks];
  for (const task of briefingTasks.slice(0, 4)) {
    const item = document.createElement("li");
    item.textContent = task.dueDate < today
      ? `${task.title} (rok ${formatForecastDate(task.dueDate)})`
      : task.dueDate > today
        ? `${task.title} (${formatForecastDate(task.dueDate)})`
        : task.title;
    list.append(item);
  }
  if (briefingTasks.length > 4) {
    const more = document.createElement("li");
    more.textContent = `i još ${briefingTasks.length - 4}`;
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

async function loadWeather(location, coordinates = null) {
  weatherStatus.textContent = "PROVJERA";
  weatherStatus.dataset.state = "working";
  try {
    const url = coordinates
      ? `/api/weather/forecast/coordinates?latitude=${encodeURIComponent(coordinates.latitude)}&longitude=${encodeURIComponent(coordinates.longitude)}`
      : `/api/weather/forecast?location=${encodeURIComponent(location)}`;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Vrijeme nije moguće provjeriti.");
    }
    weatherLocation.textContent = payload.location;
    const today = payload.days[0];
    if (!today) {
      throw new Error("Današnja prognoza nije dostupna.");
    }
    weatherSummary.textContent =
      payload.country
        ? `${payload.location}, ${payload.country} · ${today.condition}`
        : `${payload.location} · ${today.condition}`;
    weatherForecast.replaceChildren();
    const card = document.createElement("article");
    card.className = "forecast-day today-forecast";
    const date = document.createElement("strong");
    date.textContent = "DANAS";
    const icon = document.createElement("span");
    icon.className = "forecast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = forecastIcon(today.condition);
    const temperatures = document.createElement("span");
    temperatures.className = "forecast-temperatures";
    temperatures.textContent =
      `${Math.round(today.temperature_min)}° / ${Math.round(today.temperature_max)}°`;
    const condition = document.createElement("span");
    condition.className = "forecast-condition";
    condition.textContent = today.condition;
    const rain = document.createElement("span");
    rain.className = "forecast-rain";
    rain.textContent =
      `${today.precipitation_probability}% mogućnost oborine`;
    card.append(date, icon, temperatures, condition, rain);
    weatherForecast.append(card);
    for (const day of payload.days) {
      const forecastCard = document.createElement("article");
      forecastCard.className = "forecast-day";
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
      forecastCard.append(date, icon, temperatures, condition, rain);
      weatherForecast.append(forecastCard);
    }
    weatherForecast.hidden = false;
    latestForecastDay = today;
    updateDailyBriefingWeather();
    weatherStatus.textContent = "AŽURNO";
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

function loadWeatherForDefaultLocation() {
  const fallbackLocation = weatherLocationInput.value.trim();
  if (!("geolocation" in navigator)) {
    loadWeather(fallbackLocation);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      loadWeather(fallbackLocation, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    () => {
      loadWeather(fallbackLocation);
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 15 * 60 * 1000,
    },
  );
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

weeklyWeatherButton.addEventListener("click", () => {
  const location = weatherLocationInput.value.trim();
  if (location) {
    loadWeather(location);
  }
});

async function loadSystemMetrics() {
  try {
    const response = await fetch("/api/system");
    const metrics = await response.json();
    if (!response.ok) {
      throw new Error(metrics.error || "Sustavni podaci nisu dostupni.");
    }
    coreCpuValue.textContent =
      `${metrics.cpu_percent.toFixed(1)}%`;
    coreMemoryValue.textContent =
      `${metrics.memory_percent.toFixed(1)}% RAM`;
    coreDataCpu.textContent = `${metrics.cpu_percent.toFixed(1)}%`;
    coreDataMemory.textContent = `${metrics.memory_percent.toFixed(1)}%`;
    coreDataDisk.textContent = `${metrics.disk_percent.toFixed(1)}%`;
  } catch {
    coreCpuValue.textContent = "---";
    coreMemoryValue.textContent = "NEDOSTUPNO";
    coreDataCpu.textContent = "--";
    coreDataMemory.textContent = "--";
    coreDataDisk.textContent = "--";
  }
}

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
    settingsName.value = settings.assistant_name;
    settingsFastModel.replaceChildren();
    settingsQualityModel.replaceChildren();
    settingsAutoRouting.checked = settings.auto_model_routing;
    settingsWakeEnabled.checked = settings.voice_wake_enabled;
    settingsWakeWord.value = settings.voice_wake_word;
    window.jarvisWakeEnabled = settings.voice_wake_enabled;
    window.jarvisWakeWord = settings.voice_wake_word;
    settingsModel.replaceChildren();
    const currentModel = document.createElement("option");
    currentModel.value = settings.ollama_model;
    currentModel.textContent = `${settings.ollama_model} (trenutačni model)`;
    settingsModel.append(currentModel);
    const fastCurrent = currentModel.cloneNode(true);
    const qualityCurrent = currentModel.cloneNode(true);
    fastCurrent.value = settings.fast_model;
    qualityCurrent.value = settings.quality_model;
    fastCurrent.textContent = `${settings.fast_model} (brzi model)`;
    qualityCurrent.textContent = `${settings.quality_model} (kvalitetni model)`;
    settingsFastModel.append(fastCurrent);
    settingsQualityModel.append(qualityCurrent);

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
      const fastOption = option.cloneNode(true);
      const qualityOption = option.cloneNode(true);
      settingsFastModel.append(fastOption);
      settingsQualityModel.append(qualityOption);
    }
    settingsModel.value = settings.ollama_model;
    settingsFastModel.value = modelNames.has(settings.fast_model)
      ? settings.fast_model
      : settings.ollama_model;
    settingsQualityModel.value = modelNames.has(settings.quality_model)
      ? settings.quality_model
      : settings.ollama_model;
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
    assistant_name: settingsName.value.trim(),
    ollama_model: settingsModel.value,
    fast_model: settingsFastModel.value,
    quality_model: settingsQualityModel.value,
    auto_model_routing: settingsAutoRouting.checked,
    voice_wake_enabled: settingsWakeEnabled.checked,
    voice_wake_word: settingsWakeWord.value.trim(),
    speech_language: settingsLanguage.value,
    weather_location: settingsLocation.value.trim(),
    theme: settingsTheme.value,
  };
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.jarvisCsrfToken,
      },
      body: JSON.stringify(settings),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Postavke nije moguće spremiti.");
    }

    window.jarvisSpeechLanguage = payload.speech_language;
    window.jarvisWakeEnabled = payload.voice_wake_enabled;
    window.jarvisWakeWord = payload.voice_wake_word;
    if (recognition) {
      recognition.lang = payload.speech_language;
    }
    document.documentElement.dataset.theme = payload.theme;
    applyAssistantName(payload.assistant_name);
    weatherLocationInput.value = payload.weather_location;
    weatherLocation.textContent = payload.weather_location;
    document.querySelectorAll(".model-name, .model-readout").forEach((element) => {
      element.textContent = payload.ollama_model;
      element.title = payload.ollama_model;
    });
    settingsDialog.close();
    loadWeatherForDefaultLocation();
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
loadWeatherForDefaultLocation();
loadSystemMetrics();
window.setInterval(loadSystemMetrics, 1000);
window.setInterval(
  loadWeatherForDefaultLocation,
  15 * 60 * 1000,
);

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
  setStatus(
    `${document.querySelector(".brand h1").textContent} razmišlja...`,
    "working",
  );

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": window.jarvisCsrfToken,
      },
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
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    if (isBusy) {
      return;
    }
    if (isListening) {
      wakeListening = false;
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      isListening = true;
      wakeListening = window.jarvisWakeEnabled === true;
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
    if (!transcript) {
      return;
    }
    if (window.jarvisWakeEnabled) {
      const wakeWord = (window.jarvisWakeWord || "hej major").toLocaleLowerCase();
      const normalized = transcript.toLocaleLowerCase();
      const wakeIndex = normalized.indexOf(wakeWord);
      if (wakeIndex < 0) {
        setStatus(`Čekam aktivacijsku frazu: ${window.jarvisWakeWord}`, "working");
        return;
      }
      const command = transcript.slice(wakeIndex + wakeWord.length).replace(/^[,.:;\s-]+/, "").trim();
      if (!command) {
        setStatus("Aktiviran — izgovori naredbu.", "working");
        return;
      }
      input.value = command;
      sendMessage(command, "voice");
      return;
    }
    input.value = transcript;
    sendMessage(transcript, "voice");
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
    if (wakeListening && window.jarvisWakeEnabled) {
      try {
        recognition.start();
        isListening = true;
        micButton.classList.add("is-listening");
        micButton.setAttribute("aria-pressed", "true");
        micLabel.textContent = "Čekam...";
        setStatus(`Čekam aktivacijsku frazu: ${window.jarvisWakeWord}`, "working");
      } catch (error) {
        wakeListening = false;
      }
      return;
    }
    if (!isBusy && statusMessage.dataset.state === "working") {
      setStatus("Spreman");
    }
  });
} else {
  micButton.disabled = true;
  micButton.title = "Glasovni unos podržan je u Chromeu i Edgeu.";
  setStatus("Glasovni unos nije podržan u ovom pregledniku; možeš tipkati.");
}
