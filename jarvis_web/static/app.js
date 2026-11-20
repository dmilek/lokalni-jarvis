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
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let isBusy = false;
let isListening = false;

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
    weatherStatus.textContent = "TJEDNO";
    weatherStatus.dataset.state = "ready";
  } catch (error) {
    weatherForecast.hidden = true;
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

loadWeeklyWeather(weatherLocationInput.value.trim());

async function sendMessage(rawMessage, source = "text") {
  const message = rawMessage.trim();
  if (!message || isBusy) {
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
  const recognition = new SpeechRecognition();
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
