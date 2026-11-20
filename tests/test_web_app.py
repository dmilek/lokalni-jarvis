import unittest

from jarvis_web import create_app
from assistant_core import AssistantError


class FakeAssistant:
    model = "test-model"

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


if __name__ == "__main__":
    unittest.main()
