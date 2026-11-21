import hmac
import json
import os
from pathlib import Path
import secrets
import shutil
import time
from tempfile import NamedTemporaryFile
from threading import Lock

from flask import Flask, current_app, jsonify, render_template, request
import psutil

from assistant_core import AssistantCore, AssistantError


CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"
SUPPORTED_SPEECH_LANGUAGES = {"hr-HR", "en-US"}
SUPPORTED_THEMES = {"jarvis", "sunset", "violet"}


def get_system_metrics():
    process = psutil.Process()
    process_cpu = process.cpu_percent(interval=0.2)
    system_memory = psutil.virtual_memory()
    disk = shutil.disk_usage("/")
    return {
        "cpu_percent": round(psutil.cpu_percent(interval=None), 1),
        "process_cpu_percent": round(process_cpu, 1),
        "memory_percent": round(system_memory.percent, 1),
        "memory_used_gb": round(system_memory.used / (1024 ** 3), 1),
        "memory_total_gb": round(system_memory.total / (1024 ** 3), 1),
        "disk_percent": round(disk.used / disk.total * 100, 1),
        "disk_used_gb": round(disk.used / (1024 ** 3), 1),
        "disk_total_gb": round(disk.total / (1024 ** 3), 1),
        "process_memory_mb": round(process.memory_info().rss / (1024 ** 2), 1),
        "uptime_seconds": max(0, int(time.time() - psutil.boot_time())),
    }


def load_config():
    with CONFIG_PATH.open("r", encoding="utf-8") as config_file:
        config = json.load(config_file)
    if not isinstance(config, dict):
        raise ValueError("config.json mora sadržavati JSON objekt.")
    return config


def _save_config(config_path, config):
    temporary_path = None
    try:
        with NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=config_path.parent,
            prefix=".config-",
            delete=False,
        ) as config_file:
            temporary_path = Path(config_file.name)
            json.dump(config, config_file, ensure_ascii=False, indent=2)
            config_file.write("\n")
        os.replace(temporary_path, config_path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def create_app(assistant=None, config=None):
    config_path = CONFIG_PATH if config is None else None
    config = load_config() if config is None else config
    if not isinstance(config, dict):
        raise ValueError("config.json mora sadržavati JSON objekt.")

    if assistant is None:
        assistant = AssistantCore(
            config.get("ollama_url", "http://127.0.0.1:11434"),
            config.get("ollama_model", "qwen2.5-coder:latest"),
            config.get("speech_language", "hr-HR"),
            fast_model=config.get("fast_model"),
            quality_model=config.get("quality_model"),
            auto_model_routing=config.get("auto_model_routing", True),
        )
    elif hasattr(assistant, "set_language"):
        assistant.set_language(config.get("speech_language", "hr-HR"))

    assistant_lock = Lock()
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    app.config["CSRF_TOKEN"] = secrets.token_urlsafe(32)

    @app.before_request
    def protect_api_mutations():
        if request.path.startswith("/api/") and request.method in {
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
        }:
            supplied_token = request.headers.get("X-CSRF-Token", "")
            if not hmac.compare_digest(supplied_token, app.config["CSRF_TOKEN"]):
                return (
                    jsonify(
                        error="Zahtjev nije valjan. Osvježi stranicu i pokušaj ponovno."
                    ),
                    403,
                )

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            greeting=config.get(
                "greeting",
                f"Pozdrav! Ja sam {config.get('assistant_name', 'M.A.J.O.R.')}, vaš osobni asistent.",
            ),
            assistant_name=config.get("assistant_name", "M.A.J.O.R."),
            model=assistant.model,
            speech_language=config.get("speech_language", "hr-HR"),
            weather_location=config.get("weather_location", "Zagreb"),
            theme=config.get("theme", "jarvis"),
            voice_wake_enabled=config.get("voice_wake_enabled", False),
            voice_wake_word=config.get("voice_wake_word", "hej major"),
            html_language="en" if config.get("speech_language", "hr-HR") == "en-US" else "hr",
            csrf_token=app.config["CSRF_TOKEN"],
        )

    @app.post("/api/chat")
    def chat():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="Očekivao sam JSON objekt s porukom."), 400
        message = payload.get("message")
        if not isinstance(message, str) or not message.strip():
            return jsonify(error="Poruka ne smije biti prazna."), 400

        try:
            with assistant_lock:
                reply = assistant.handle(message)
        except AssistantError as exc:
            current_app.logger.warning("Assistant chat request failed: %s", exc)
            return jsonify(
                error=(
                    f"{config.get('assistant_name', 'M.A.J.O.R.')} trenutno ne može odgovoriti. "
                    "Provjeri lokalni model i pokušaj ponovno."
                )
            ), 502
        return jsonify(reply=reply)

    @app.get("/api/weather")
    def weather():
        location = request.args.get("location", "").strip()
        if not location:
            return jsonify(error="Unesi naziv mjesta."), 400
        try:
            reply = assistant.handle(f"kakvo je vrijeme u {location}")
        except AssistantError as exc:
            current_app.logger.warning("Weather request failed: %s", exc)
            return jsonify(error="Trenutačnu prognozu nije moguće dohvatiti."), 502
        return jsonify(reply=reply)

    @app.get("/api/weather/forecast")
    def weather_forecast():
        location = request.args.get("location", "").strip()
        if not location:
            return jsonify(error="Unesi naziv mjesta."), 400
        try:
            forecast = assistant.get_weekly_weather(location)
        except AssistantError as exc:
            current_app.logger.warning("Weekly weather request failed: %s", exc)
            return jsonify(error="Tjednu prognozu nije moguće dohvatiti."), 502
        return jsonify(forecast)

    @app.get("/api/weather/forecast/coordinates")
    def weather_forecast_coordinates():
        try:
            latitude = float(request.args["latitude"])
            longitude = float(request.args["longitude"])
        except (KeyError, TypeError, ValueError):
            return jsonify(error="Koordinate lokacije nisu valjane."), 400
        try:
            forecast = assistant.get_weekly_weather_at_coordinates(
                latitude,
                longitude,
            )
        except AssistantError as exc:
            current_app.logger.warning(
                "Coordinate weather request failed: %s",
                exc,
            )
            return jsonify(error="Vremensku prognozu za lokaciju nije moguće dohvatiti."), 502
        return jsonify(forecast)

    @app.get("/api/settings")
    def get_settings():
        return jsonify(
            assistant_name=config.get("assistant_name", "M.A.J.O.R."),
            ollama_model=assistant.model,
            fast_model=getattr(assistant, "fast_model", assistant.model),
            quality_model=getattr(assistant, "quality_model", assistant.model),
            auto_model_routing=getattr(assistant, "auto_model_routing", True),
            voice_wake_enabled=config.get("voice_wake_enabled", False),
            voice_wake_word=config.get("voice_wake_word", "hej major"),
            speech_language=config.get("speech_language", "hr-HR"),
            weather_location=config.get("weather_location", "Zagreb"),
            theme=config.get("theme", "jarvis"),
        )

    @app.get("/api/system")
    def system_metrics():
        try:
            return jsonify(get_system_metrics())
        except (OSError, RuntimeError, psutil.Error):
            return jsonify(error="Sustavne podatke nije moguće dohvatiti."), 503

    @app.get("/api/models")
    def get_models():
        try:
            with assistant_lock:
                models = assistant.get_available_models()
        except AssistantError as exc:
            current_app.logger.warning("Ollama model-list request failed: %s", exc)
            return jsonify(error="Popis lokalnih modela nije moguće dohvatiti."), 502
        return jsonify(models=models)

    @app.post("/api/settings")
    def update_settings():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="Očekivao sam JSON objekt s postavkama."), 400

        model = payload.get("ollama_model")
        assistant_name = payload.get(
            "assistant_name",
            config.get("assistant_name", "M.A.J.O.R."),
        )
        speech_language = payload.get("speech_language")
        weather_location = payload.get("weather_location")
        theme = payload.get("theme")
        fast_model = payload.get("fast_model", model)
        quality_model = payload.get("quality_model", model)
        auto_model_routing = payload.get("auto_model_routing", True)
        voice_wake_enabled = payload.get("voice_wake_enabled", False)
        voice_wake_word = payload.get("voice_wake_word", "hej major")
        if not isinstance(model, str) or not model.strip() or len(model) > 200:
            return jsonify(error="Odaberi valjan Ollama model."), 400
        if (
            not isinstance(assistant_name, str)
            or not assistant_name.strip()
            or len(assistant_name.strip()) > 40
        ):
            return jsonify(error="Ime asistenta mora imati od 1 do 40 znakova."), 400
        if (
            not isinstance(speech_language, str)
            or speech_language not in SUPPORTED_SPEECH_LANGUAGES
        ):
            return jsonify(error="Odaberi podržani jezik govora."), 400
        if not isinstance(theme, str) or theme not in SUPPORTED_THEMES:
            return jsonify(error="Odaberi podržanu temu."), 400
        if not isinstance(fast_model, str) or not fast_model.strip():
            return jsonify(error="Odaberi valjan brzi model."), 400
        if not isinstance(quality_model, str) or not quality_model.strip():
            return jsonify(error="Odaberi valjan kvalitetni model."), 400
        if not isinstance(auto_model_routing, bool):
            return jsonify(error="Postavka automatskog odabira modela mora biti DA/NE."), 400
        if not isinstance(voice_wake_enabled, bool):
            return jsonify(error="Postavka buđenja glasom mora biti DA/NE."), 400
        if (
            not isinstance(voice_wake_word, str)
            or not voice_wake_word.strip()
            or len(voice_wake_word.strip()) > 40
        ):
            return jsonify(error="Proizvoljno aktivacijsko ime mora imati 1 do 40 znakova."), 400
        if (
            not isinstance(weather_location, str)
            or not weather_location.strip()
            or len(weather_location.strip()) > 100
        ):
            return jsonify(error="Unesi mjesto do 100 znakova."), 400

        updated_config = dict(config)
        previous_name = str(config.get("assistant_name", "M.A.J.O.R.")).strip()
        greeting = config.get("greeting")
        if assistant_name.strip() != previous_name:
            greeting = (
                f"Hello! I am {assistant_name.strip()}, your personal assistant."
                if speech_language == "en-US"
                else f"Pozdrav! Ja sam {assistant_name.strip()}, vaš osobni asistent."
            )
        updated_config.update(
            assistant_name=assistant_name.strip(),
            greeting=greeting,
            ollama_model=model.strip(),
            fast_model=fast_model.strip(),
            quality_model=quality_model.strip(),
            auto_model_routing=auto_model_routing,
            voice_wake_enabled=voice_wake_enabled,
            voice_wake_word=voice_wake_word.strip(),
            speech_language=speech_language,
            weather_location=weather_location.strip(),
            theme=theme,
        )
        with assistant_lock:
            requested_models = {model.strip(), fast_model.strip(), quality_model.strip()}
            if requested_models - {assistant.model}:
                try:
                    available_models = assistant.get_available_models()
                except AssistantError as exc:
                    current_app.logger.warning(
                        "Ollama model-list request failed: %s", exc
                    )
                    return (
                        jsonify(error="Popis lokalnih modela nije moguće dohvatiti."),
                        502,
                    )
                missing_models = sorted(requested_models - set(available_models))
                if missing_models:
                    return jsonify(
                        error=f"Model nije instaliran u Ollami: {missing_models[0]}",
                    ), 400

            if config_path is not None:
                try:
                    _save_config(config_path, updated_config)
                except OSError as exc:
                    return jsonify(error="Postavke nije moguće spremiti u config.json."), 500
            assistant.model = model.strip()
            if hasattr(assistant, "fast_model"):
                assistant.fast_model = fast_model.strip()
                assistant.quality_model = quality_model.strip()
                assistant.auto_model_routing = auto_model_routing
            if hasattr(assistant, "set_language"):
                assistant.set_language(speech_language)

        config.clear()
        config.update(updated_config)
        return jsonify(
            assistant_name=assistant_name.strip(),
            ollama_model=assistant.model,
            fast_model=getattr(assistant, "fast_model", assistant.model),
            quality_model=getattr(assistant, "quality_model", assistant.model),
            auto_model_routing=getattr(assistant, "auto_model_routing", True),
            voice_wake_enabled=voice_wake_enabled,
            voice_wake_word=voice_wake_word.strip(),
            speech_language=speech_language,
            weather_location=weather_location.strip(),
            theme=theme,
        )

    @app.errorhandler(413)
    def request_too_large(error):
        return jsonify(error="Zahtjev je prevelik."), 413

    return app


def main():
    app = create_app()
    print("M.A.J.O.R. web-GUI: http://127.0.0.1:8000", flush=True)
    app.run(
        host="127.0.0.1",
        port=8000,
        debug=False,
        use_reloader=False,
        threaded=True,
    )
