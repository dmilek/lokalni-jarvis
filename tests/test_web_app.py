import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jarvis_web import create_app
from assistant_core import AssistantError


class FakeAssistant:
    model = "test-model"

    def get_available_models(self):
        return ["test-model", "other-model"]

    def handle(self, message):
        if message == "fail":
            raise AssistantError("Test error")
        return "Odgovor: " + message

    def get_weekly_weather(self, location):
        return {
            "location": location,
            "country": "Republika Hrvatska",
            "timezone": "Europe/Zagreb",
            "days": [
                {
                    "date": "2026-11-20",
                    "condition": "vedro",
                    "temperature_max": 12,
                    "temperature_min": 5,
                    "precipitation": 0,
                    "precipitation_probability": 5,
                    "wind_max": 12,
                }
            ],
        }


class WebAppTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(
            assistant=FakeAssistant(),
            config={
                "greeting": "Bok!",
                "ollama_model": "test-model",
                "speech_language": "hr-HR",
            },
        )
        self.client = self.app.test_client()

    def test_homepage_renders_web_interface(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Lokalni Jarvis", response.data)
        self.assertIn(b"Bok!", response.data)
        self.assertIn(b"settings-dialog", response.data)
        self.assertIn(b"tasks-dialog", response.data)

    def test_chat_api_returns_assistant_reply(self):
        response = self.client.post("/api/chat", json={"message": "Pozdrav"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"reply": "Odgovor: Pozdrav"})

    def test_chat_api_rejects_empty_message(self):
        response = self.client.post("/api/chat", json={"message": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertIn("Poruka ne smije biti prazna.", response.get_json()["error"])

    def test_chat_api_surfaces_assistant_errors(self):
        response = self.client.post("/api/chat", json={"message": "fail"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json(), {"error": "Test error"})

    def test_weekly_forecast_api(self):
        response = self.client.get("/api/weather/forecast?location=Zagreb")

        self.assertEqual(response.status_code, 200)
        forecast = response.get_json()
        self.assertEqual(forecast["location"], "Zagreb")
        self.assertEqual(len(forecast["days"]), 1)

    def test_settings_api_returns_local_preferences(self):
        response = self.client.get("/api/settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "ollama_model": "test-model",
                "speech_language": "hr-HR",
                "weather_location": "Zagreb",
                "theme": "jarvis",
            },
        )

    def test_models_api_returns_installed_models(self):
        response = self.client.get("/api/models")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"models": ["test-model", "other-model"]})

    def test_settings_api_updates_validated_preferences(self):
        response = self.client.post(
            "/api/settings",
            json={
                "ollama_model": "other-model",
                "speech_language": "en-US",
                "weather_location": "Split",
                "theme": "sunset",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["ollama_model"], "other-model")
        self.assertEqual(response.get_json()["weather_location"], "Split")
        settings = self.client.get("/api/settings").get_json()
        self.assertEqual(settings["theme"], "sunset")

    def test_settings_api_rejects_uninstalled_model(self):
        response = self.client.post(
            "/api/settings",
            json={
                "ollama_model": "missing-model",
                "speech_language": "hr-HR",
                "weather_location": "Zagreb",
                "theme": "jarvis",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("nije instaliran", response.get_json()["error"])

    def test_settings_api_persists_preferences_to_local_config(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "greeting": "Bok!",
                        "ollama_model": "test-model",
                        "ollama_url": "http://127.0.0.1:11434",
                    }
                ),
                encoding="utf-8",
            )
            with patch("jarvis_web.CONFIG_PATH", config_path):
                app = create_app(assistant=FakeAssistant())
                response = app.test_client().post(
                    "/api/settings",
                    json={
                        "ollama_model": "test-model",
                        "speech_language": "en-US",
                        "weather_location": "Rijeka",
                        "theme": "violet",
                    },
                )

            self.assertEqual(response.status_code, 200)
            saved_config = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(saved_config["weather_location"], "Rijeka")
            self.assertEqual(saved_config["theme"], "violet")
            self.assertEqual(saved_config["greeting"], "Bok!")

    def test_settings_api_rejects_invalid_theme_and_location(self):
        invalid_theme = self.client.post(
            "/api/settings",
            json={
                "ollama_model": "test-model",
                "speech_language": "hr-HR",
                "weather_location": "Zagreb",
                "theme": ["unexpected"],
            },
        )
        invalid_location = self.client.post(
            "/api/settings",
            json={
                "ollama_model": "test-model",
                "speech_language": "hr-HR",
                "weather_location": " ",
                "theme": "jarvis",
            },
        )

        self.assertEqual(invalid_theme.status_code, 400)
        self.assertEqual(invalid_location.status_code, 400)


if __name__ == "__main__":
    unittest.main()
