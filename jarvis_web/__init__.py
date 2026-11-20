import json
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, render_template, request

from assistant_core import AssistantCore, AssistantError


def load_config():
    config_path = Path(__file__).resolve().parent.parent / "config.json"
    with config_path.open("r", encoding="utf-8") as config_file:
        config = json.load(config_file)
    if not isinstance(config, dict):
        raise ValueError("config.json mora sadržavati JSON objekt.")
    return config


def create_app(assistant=None, config=None):
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
            model=config.get("ollama_model", "qwen2.5-coder:latest"),
            speech_language=config.get("speech_language", "hr-HR"),
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
