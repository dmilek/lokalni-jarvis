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


class FailingAssistant(FakeAssistant):
    def handle(self, message):
        raise AssistantError("UPSTREAM-SECRET-SENTINEL")

    def get_available_models(self):
        raise AssistantError("UPSTREAM-SECRET-SENTINEL")

    def get_weekly_weather(self, location):
        raise AssistantError("UPSTREAM-SECRET-SENTINEL")


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

    def post_json(self, path, **kwargs):
        headers = {"X-CSRF-Token": self.app.config["CSRF_TOKEN"]}
        headers.update(kwargs.pop("headers", {}))
        return self.client.post(path, headers=headers, **kwargs)

    def test_homepage_renders_web_interface(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Lokalni M.A.J.O.R.", response.data)
        self.assertIn(b"Bok!", response.data)
        self.assertIn(b"settings-dialog", response.data)
        self.assertIn(b"tasks-dialog", response.data)
        self.assertIn(b"jarvisCsrfToken", response.data)
        self.assertIn(b"core-cpu-value", response.data)
        self.assertIn(b"core-memory-value", response.data)

    def test_system_metrics_api_returns_real_usage_fields(self):
        response = self.client.get("/api/system")

        self.assertEqual(response.status_code, 200)
        metrics = response.get_json()
        for key in (
            "cpu_percent",
            "process_cpu_percent",
            "memory_percent",
            "memory_used_gb",
            "memory_total_gb",
            "disk_percent",
            "disk_used_gb",
            "disk_total_gb",
            "process_memory_mb",
            "uptime_seconds",
        ):
            self.assertIn(key, metrics)

    def test_task_parser_supports_natural_croatian_imperatives(self):
        app_js = Path(__file__).resolve().parents[1] / "jarvis_web" / "static" / "app.js"
        source = app_js.read_text(encoding="utf-8")

        parser_section = source[source.index("function parseTaskCommand"):source.index("function isDailyBriefingCommand")]
        self.assertIn("odvesti", parser_section.lower())
        self.assertIn("odvesti|odnijeti|kupiti", parser_section)
        self.assertIn("task|tasks", parser_section)
        self.assertIn("moram", parser_section)

    def test_chat_api_returns_assistant_reply(self):
        response = self.post_json("/api/chat", json={"message": "Pozdrav"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"reply": "Odgovor: Pozdrav"})

    def test_chat_api_rejects_empty_message(self):
        response = self.post_json("/api/chat", json={"message": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertIn("Poruka ne smije biti prazna.", response.get_json()["error"])

    def test_chat_api_surfaces_assistant_errors(self):
        response = self.post_json("/api/chat", json={"message": "fail"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.get_json(),
            {
                "error": (
                    "M.A.J.O.R. trenutno ne može odgovoriti. "
                    "Provjeri lokalni model i pokušaj ponovno."
                )
            },
        )

    def test_api_mutations_require_csrf_token(self):
        response = self.client.post("/api/chat", json={"message": "Pozdrav"})

        self.assertEqual(response.status_code, 403)
        self.assertNotIn("reply", response.get_json())

    def test_assistant_error_details_are_not_returned_by_api(self):
        app = create_app(
            assistant=FailingAssistant(),
            config={"ollama_model": "test-model", "speech_language": "hr-HR"},
        )
        client = app.test_client()
        csrf_headers = {"X-CSRF-Token": app.config["CSRF_TOKEN"]}
        responses = [
            client.post(
                "/api/chat",
                json={"message": "hello"},
                headers=csrf_headers,
            ),
            client.get("/api/weather?location=Zagreb"),
            client.get("/api/weather/forecast?location=Zagreb"),
            client.get("/api/models"),
            client.post(
                "/api/settings",
                json={
                    "ollama_model": "other-model",
                    "speech_language": "hr-HR",
                    "weather_location": "Zagreb",
                    "theme": "jarvis",
                },
                headers=csrf_headers,
            ),
        ]

        for response in responses:
            with self.subTest(status=response.status_code):
                self.assertEqual(response.status_code, 502)
                self.assertNotIn(
                    "UPSTREAM-SECRET-SENTINEL",
                    response.get_data(as_text=True),
                )

    def test_weekly_forecast_api(self):
        response = self.client.get("/api/weather/forecast?location=Zagreb")

        self.assertEqual(response.status_code, 200)
        forecast = response.get_json()
        self.assertEqual(forecast["location"], "Zagreb")
        self.assertEqual(len(forecast["days"]), 1)

    def test_coordinate_forecast_api_rejects_invalid_coordinates(self):
        response = self.client.get(
            "/api/weather/forecast/coordinates?latitude=not-a-number&longitude=0"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Koordinate", response.get_json()["error"])

    def test_settings_api_returns_local_preferences(self):
        response = self.client.get("/api/settings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json(),
            {
                "assistant_name": "M.A.J.O.R.",
                "ollama_model": "test-model",
                "fast_model": "test-model",
                "quality_model": "test-model",
                "auto_model_routing": True,
                "voice_wake_enabled": False,
                "voice_wake_word": "hej major",
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
        response = self.post_json(
            "/api/settings",
            json={
                "assistant_name": "MIHAEL",
                "ollama_model": "other-model",
                "speech_language": "en-US",
                "weather_location": "Split",
                "theme": "sunset",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["assistant_name"], "MIHAEL")
        self.assertEqual(response.get_json()["ollama_model"], "other-model")
        self.assertEqual(response.get_json()["weather_location"], "Split")
        settings = self.client.get("/api/settings").get_json()
        self.assertEqual(settings["theme"], "sunset")

    def test_settings_api_rejects_uninstalled_model(self):
        response = self.post_json(
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
                    headers={"X-CSRF-Token": app.config["CSRF_TOKEN"]},
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
        invalid_theme = self.post_json(
            "/api/settings",
            json={
                "ollama_model": "test-model",
                "speech_language": "hr-HR",
                "weather_location": "Zagreb",
                "theme": ["unexpected"],
            },
        )
        invalid_location = self.post_json(
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
