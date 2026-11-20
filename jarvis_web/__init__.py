import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock

from flask import Flask, jsonify, render_template, request

from assistant_core import AssistantCore, AssistantError


CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"
SUPPORTED_SPEECH_LANGUAGES = {"hr-HR", "en-US"}
SUPPORTED_THEMES = {"jarvis", "sunset", "violet"}


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
        )

    assistant_lock = Lock()
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            greeting=config.get(
                "greeting", "Pozdrav! Ja sam Jarvis, vaš osobni asistent."
            ),
            model=assistant.model,
            speech_language=config.get("speech_language", "hr-HR"),
            weather_location=config.get("weather_location", "Zagreb"),
            theme=config.get("theme", "jarvis"),
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
            return jsonify(error=str(exc)), 502
        return jsonify(reply=reply)

    @app.get("/api/weather")
    def weather():
        location = request.args.get("location", "").strip()
        if not location:
            return jsonify(error="Unesi naziv mjesta."), 400
        try:
            reply = assistant.handle(f"kakvo je vrijeme u {location}")
        except AssistantError as exc:
            return jsonify(error=str(exc)), 502
        return jsonify(reply=reply)

    @app.get("/api/weather/forecast")
    def weather_forecast():
        location = request.args.get("location", "").strip()
        if not location:
            return jsonify(error="Unesi naziv mjesta."), 400
        try:
            forecast = assistant.get_weekly_weather(location)
        except AssistantError as exc:
            return jsonify(error=str(exc)), 502
        return jsonify(forecast)

    @app.get("/api/settings")
    def get_settings():
        return jsonify(
            ollama_model=assistant.model,
            speech_language=config.get("speech_language", "hr-HR"),
            weather_location=config.get("weather_location", "Zagreb"),
            theme=config.get("theme", "jarvis"),
        )

    @app.get("/api/models")
    def get_models():
        try:
            with assistant_lock:
                models = assistant.get_available_models()
        except AssistantError as exc:
            return jsonify(error=str(exc)), 502
        return jsonify(models=models)

    @app.post("/api/settings")
    def update_settings():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="Očekivao sam JSON objekt s postavkama."), 400

        model = payload.get("ollama_model")
        speech_language = payload.get("speech_language")
        weather_location = payload.get("weather_location")
        theme = payload.get("theme")
        if not isinstance(model, str) or not model.strip() or len(model) > 200:
            return jsonify(error="Odaberi valjan Ollama model."), 400
        if (
            not isinstance(speech_language, str)
            or speech_language not in SUPPORTED_SPEECH_LANGUAGES
        ):
            return jsonify(error="Odaberi podržani jezik govora."), 400
        if not isinstance(theme, str) or theme not in SUPPORTED_THEMES:
            return jsonify(error="Odaberi podržanu temu."), 400
        if (
            not isinstance(weather_location, str)
            or not weather_location.strip()
            or len(weather_location.strip()) > 100
        ):
            return jsonify(error="Unesi mjesto do 100 znakova."), 400

        updated_config = dict(config)
        updated_config.update(
            ollama_model=model.strip(),
            speech_language=speech_language,
            weather_location=weather_location.strip(),
            theme=theme,
        )
        with assistant_lock:
            if model.strip() != assistant.model:
                try:
                    available_models = assistant.get_available_models()
                except AssistantError as exc:
                    return jsonify(error=str(exc)), 502
                if model.strip() not in available_models:
                    return jsonify(error="Odabrani model nije instaliran u Ollami."), 400

            if config_path is not None:
                try:
                    _save_config(config_path, updated_config)
                except OSError as exc:
                    return jsonify(error="Postavke nije moguće spremiti u config.json."), 500
            assistant.model = model.strip()

        config.clear()
        config.update(updated_config)
        return jsonify(
            ollama_model=assistant.model,
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
    print("Jarvis web-GUI: http://127.0.0.1:8000", flush=True)
    app.run(
        host="127.0.0.1",
        port=8000,
        debug=False,
        use_reloader=False,
        threaded=True,
    )
