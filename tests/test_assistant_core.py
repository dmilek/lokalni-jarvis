import io
import json
import urllib.error
import unittest
from unittest.mock import Mock, patch

from assistant_core import AssistantCore, AssistantError
from duckduckgo_search.exceptions import RatelimitException


class AssistantCoreTests(unittest.TestCase):
    def setUp(self):
        self.assistant = AssistantCore(
            "http://127.0.0.1:11434", "qwen2.5-coder:latest"
        )

    def test_available_models_uses_local_ollama_tags(self):
        response = io.BytesIO(
            json.dumps(
                {
                    "models": [
                        {"name": "qwen:14b"},
                        {"name": "llama:latest"},
                        {"name": "qwen:14b"},
                    ]
                }
            ).encode("utf-8")
        )
        with patch(
            "assistant_core.urllib.request.urlopen", return_value=response
        ) as open_url:
            models = self.assistant.get_available_models()

        self.assertEqual(models, ["qwen:14b", "llama:latest"])
        self.assertEqual(
            open_url.call_args.args[0].full_url,
            "http://127.0.0.1:11434/api/tags",
        )

    def test_available_models_reports_ollama_connection_errors(self):
        with patch(
            "assistant_core.urllib.request.urlopen",
            side_effect=urllib.error.URLError("offline"),
        ):
            with self.assertRaisesRegex(AssistantError, "Ne mogu se povezati s Ollamom"):
                self.assistant.get_available_models()

    def test_chat_text_is_sent_to_local_model_not_executed(self):
        with patch.object(self.assistant, "_chat", return_value="Odgovor") as chat:
            response = self.assistant.handle("napravi mi popis ideja")

        self.assertEqual(response, "Odgovor")
        chat.assert_called_once_with("napravi mi popis ideja")

    def test_opens_allowed_application(self):
        result = Mock(returncode=0)
        with patch("assistant_core.subprocess.run", return_value=result) as run:
            response = self.assistant.handle("otvori VS Code")

        self.assertEqual(response, "Otvorio sam aplikaciju Visual Studio Code.")
        run.assert_called_once()

    def test_opens_project_in_vscode(self):
        result = Mock(returncode=0)
        with patch("assistant_core.subprocess.run", return_value=result) as run:
            response = self.assistant.handle("otvori ovaj projekt u VSCode")

        self.assertIn("Visual Studio Code", response)
        run.assert_called_once()

    def test_runs_tests_in_workspace(self):
        result = Mock(returncode=0, stdout="..\\nOK", stderr="")
        with patch("assistant_core.subprocess.run", return_value=result) as run:
            response = self.assistant.handle("pokreni testove")

        self.assertIn("Testovi", response)
        self.assertIn("OK", response)
        run.assert_called_once()

    def test_shows_git_status(self):
        result = Mock(
            returncode=0,
            stdout="## main",
            stderr="",
        )
        with patch("assistant_core.subprocess.run", return_value=result) as run:
            response = self.assistant.handle("git status")

        self.assertIn("Git status", response)
        self.assertIn("## main", response)
        run.assert_called_once()

    def test_git_commit_requires_message_and_runs_add_commit(self):
        responses = [
            Mock(returncode=0, stdout="true\n", stderr=""),
            Mock(returncode=0, stdout="", stderr=""),
            Mock(returncode=1, stdout="", stderr=""),
            Mock(returncode=0, stdout="[main abc123] Update UI\n", stderr=""),
        ]
        commit_message = "Update UI; echo unsafe"
        with patch("assistant_core.subprocess.run", side_effect=responses) as run:
            response = self.assistant.handle(f"git commit {commit_message}")

        self.assertIn("Update UI", response)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertIn(["git", "add", "-A"], commands)
        self.assertIn(["git", "commit", "-m", commit_message], commands)
        self.assertTrue(
            all(call.kwargs["shell"] is False for call in run.call_args_list)
        )

    def test_long_prompt_is_rejected_before_weather_location_extraction(self):
        with patch.object(
            self.assistant,
            "_weather_location",
            side_effect=AssertionError("weather regex should not run"),
        ) as extract_location:
            with self.assertRaisesRegex(AssistantError, "Poruka je preduga"):
                self.assistant.handle("weather in " + "x" * 2000)

        extract_location.assert_not_called()

    def test_git_sync_pulls_before_commit_and_push(self):
        responses = [
            Mock(returncode=0, stdout="true\n", stderr=""),
            Mock(returncode=0, stdout="git@example.com:repo.git\n", stderr=""),
            Mock(returncode=0, stdout="main\n", stderr=""),
            Mock(returncode=0, stdout="Already up to date.\n", stderr=""),
            Mock(returncode=0, stdout="true\n", stderr=""),
            Mock(returncode=0, stdout="", stderr=""),
            Mock(returncode=1, stdout="", stderr=""),
            Mock(returncode=0, stdout="[main def456] Sync changes\n", stderr=""),
            Mock(returncode=0, stdout="Everything up-to-date\n", stderr=""),
        ]
        with patch("assistant_core.subprocess.run", side_effect=responses) as run:
            response = self.assistant.handle("git sync Sync changes")

        commands = [call.args[0] for call in run.call_args_list]
        pull_index = commands.index(
            ["git", "pull", "--rebase", "--autostash", "origin", "main"]
        )
        commit_index = commands.index(
            ["git", "commit", "-m", "Sync changes"]
        )
        push_index = commands.index(["git", "push", "origin", "main"])
        self.assertLess(pull_index, commit_index)
        self.assertLess(commit_index, push_index)
        self.assertIn("origin/main", response)

    def test_web_search_summarizes_results_and_shows_sources(self):
        results = [
            {
                "title": "Naslov",
                "body": "Sažetak",
                "href": "https://example.com",
            }
        ]
        with patch("assistant_core.DDGS") as search:
            search.return_value.text.return_value = results
            with patch.object(self.assistant, "_chat", return_value="Sažetak weba"):
                response = self.assistant.handle("pretraži internet za primjer")

        search.return_value.text.assert_called_once_with(
            "primjer", max_results=5
        )
        self.assertIn("Sažetak weba", response)
        self.assertIn("https://example.com", response)

    def test_web_search_rate_limit_is_explained(self):
        with patch("assistant_core.DDGS", side_effect=RatelimitException("limited")):
            with self.assertRaisesRegex(AssistantError, "privremeno ograničio"):
                self.assistant.handle("pretraži internet za primjer")

    def test_weather_query_uses_open_meteo_for_inflected_zagreb(self):
        geocoding = {
            "results": [
                {
                    "name": "Zagreb",
                    "country": "Republika Hrvatska",
                    "latitude": 45.81444,
                    "longitude": 15.97798,
                }
            ]
        }
        forecast = {
            "timezone": "Europe/Zagreb",
            "current": {
                "time": "2026-11-18T20:00",
                "temperature_2m": 14.2,
                "apparent_temperature": 12.2,
                "relative_humidity_2m": 69,
                "precipitation": 0.0,
                "wind_speed_10m": 11.3,
                "weather_code": 0,
            },
        }
        responses = [
            io.BytesIO(json.dumps(geocoding).encode("utf-8")),
            io.BytesIO(json.dumps(forecast).encode("utf-8")),
        ]
        with patch(
            "assistant_core.urllib.request.urlopen", side_effect=responses
        ) as open_url:
            with patch("assistant_core.DDGS") as search:
                response = self.assistant.handle(
                    "pretraži internet  kakvo je vrijeme u Zagrebu"
                )

        self.assertIn("Vrijeme u Zagreb", response)
        self.assertIn("vedro, 14.2 °C", response)
        self.assertIn("Europe/Zagreb", response)
        self.assertIn("open-meteo.com", response)
        self.assertEqual(open_url.call_count, 2)
        search.assert_not_called()

    def test_weather_network_errors_are_explained(self):
        with patch(
            "assistant_core.urllib.request.urlopen",
            side_effect=urllib.error.URLError("offline"),
        ):
            with self.assertRaisesRegex(AssistantError, "Open-Meteo trenutno nije dostupan"):
                self.assistant.handle("kakvo je vrijeme u Zagrebu")

    def test_weather_location_is_extracted_from_flexible_questions(self):
        cases = (
            ("kolika je temperatura u Rimu?", "Rimu"),
            ("prognoza za London", "London"),
            ("kakva je prognoza u Splitu", "Splitu"),
            ("what is the weather in Vienna?", "Vienna"),
        )
        for prompt, expected in cases:
            with self.subTest(prompt=prompt):
                self.assertEqual(
                    self.assistant._weather_location(prompt),
                    expected,
                )

    def test_location_candidates_map_karlovcu_to_karlovac(self):
        self.assertEqual(
            self.assistant._location_candidates("Karlovcu"),
            ("Karlovac",),
        )

    def test_common_hyrbid_location_normalization(self):
        cases = (
            ("Londonu", "London"),
            ("Rimu", "Rim"),
            ("Zagrebu", "Zagreb"),
            ("Karlovcu", "Karlovac"),
        )
        for location, expected in cases:
            with self.subTest(location=location):
                self.assertEqual(
                    self.assistant._location_candidates(location)[0],
                    expected,
                )

    def test_karlovac_query_returns_croatian_city(self):
        geocoding = {
            "results": [
                {
                    "name": "Karlovac",
                    "country": "Republika Hrvatska",
                    "latitude": 45.49295,
                    "longitude": 15.55534,
                }
            ]
        }
        forecast = {
            "timezone": "Europe/Zagreb",
            "current": {
                "time": "2026-11-20T10:00",
                "temperature_2m": 11.2,
                "apparent_temperature": 10.1,
                "relative_humidity_2m": 60,
                "precipitation": 0.0,
                "wind_speed_10m": 4.0,
                "weather_code": 0,
            },
        }
        with patch(
            "assistant_core.urllib.request.urlopen",
            side_effect=[
                io.BytesIO(json.dumps(geocoding).encode("utf-8")),
                io.BytesIO(json.dumps(forecast).encode("utf-8")),
            ],
        ) as open_url:
            response = self.assistant.handle("kakvo je vrijeme u Karlovcu")

        self.assertIn("Vrijeme u Karlovac", response)
        self.assertIn("Republika Hrvatska", response)
        self.assertEqual(open_url.call_count, 2)

    def test_weekly_weather_returns_seven_days(self):
        geocoding = {
            "results": [
                {
                    "name": "Zagreb",
                    "country": "Republika Hrvatska",
                    "latitude": 45.81444,
                    "longitude": 15.97798,
                    "country_code": "HR",
                }
            ]
        }
        forecast = {
            "timezone": "Europe/Zagreb",
            "daily": {
                "time": ["2026-11-20", "2026-11-21"],
                "weather_code": [0, 61],
                "temperature_2m_max": [12.0, 10.0],
                "temperature_2m_min": [5.0, 4.0],
                "precipitation_sum": [0.0, 3.0],
                "precipitation_probability_max": [5, 80],
                "wind_speed_10m_max": [12.0, 20.0],
            },
        }
        with patch(
            "assistant_core.urllib.request.urlopen",
            side_effect=[
                io.BytesIO(json.dumps(geocoding).encode("utf-8")),
                io.BytesIO(json.dumps(forecast).encode("utf-8")),
            ],
        ):
            response = self.assistant.get_weekly_weather("Zagreb")

        self.assertEqual(response["location"], "Zagreb")
        self.assertEqual(len(response["days"]), 2)
        self.assertEqual(response["days"][0]["temperature_max"], 12.0)
        self.assertEqual(response["days"][1]["precipitation_probability"], 80)

    def test_open_rejects_non_web_schemes(self):
        with patch("assistant_core.webbrowser.open") as open_browser:
            with self.assertRaises(AssistantError):
                self.assistant.handle("otvori javascript:alert(1)")

        open_browser.assert_not_called()

    def test_open_accepts_http_address(self):
        with patch("assistant_core.webbrowser.open", return_value=True) as open_browser:
            response = self.assistant.handle("otvori https://example.com")

        self.assertIn("https://example.com", response)
        open_browser.assert_called_once_with("https://example.com", new=2)

    def test_ollama_endpoint_must_be_local(self):
        with self.assertRaises(ValueError):
            AssistantCore("https://example.com", "model")


if __name__ == "__main__":
    unittest.main()
