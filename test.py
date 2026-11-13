#!/usr/bin/env python3
"""Offline unit and step-by-step checks for the IELTS Study Assistant."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

PROJECT_DIR = Path(__file__).resolve().parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from AI_quiz.graph import (
    guardrail_node,
    ingest_node,
    listening_teacher_node,
    orchestrator_node,
    preprocess_node,
    reading_teacher_node,
    summarizer_node,
    writing_teacher_node,
)
from AI_quiz.quiz_api import app
from AI_quiz.tools import (
    clean_text,
    export_to_excel,
    export_to_word,
    extract_document_text,
    generate_writing_chart,
    guardrail_check,
    ocr_image_to_text,
    post_to_sql_backend,
)
from fastapi.testclient import TestClient


SAFE_RESPONSE = {
    "is_safe": True,
    "is_relevant": True,
    "passed": True,
    "reason": "accepted",
}

SAMPLE_TEXT = (
    "Universities are increasingly investing in renewable energy and sustainable "
    "technology. Students study the environmental impact of solar power and climate policy."
)


def make_state(**overrides):
    state = {
        "raw_input": SAMPLE_TEXT,
        "input_type": "text",
        "selected_skill": "Reading",
        "user_tier": "Gold",
        "user_id": "test-user",
        "quiz_title": "Unit Test Quiz",
        "llm": lambda **_: json.dumps(SAFE_RESPONSE),
        "tool_params": {
            "search_url": "https://example.test/search",
            "chart_output_path": "",
        },
        "extracted_text": SAMPLE_TEXT,
        "cleaned_text": SAMPLE_TEXT,
        "detected_topic": "Environment & Renewable Energy",
        "target_level": "Band 7.0 - 7.5 (Advanced / Academic)",
    }
    state.update(overrides)
    return state


class TestConfigurationAndLauncher(unittest.TestCase):
    def test_launcher_discovers_parent_venv(self):
        from main import IeltsAppLauncher

        launcher = IeltsAppLauncher()
        self.assertTrue(launcher.venv_python.name.lower() == "python.exe")
        self.assertEqual(launcher.service_processes, [])

    def test_configured_model_name(self):
        import configparser

        config = configparser.ConfigParser()
        config.read(PROJECT_DIR / "config.cfg")
        self.assertEqual(config["ai_model"].get("OPENROUTER_MODEL_NAME", config["ai_model"].get("model_name")), "nvidia/nemotron-3-ultra-550b-a55b:free")


class TestTools(unittest.TestCase):
    def test_clean_text(self):
        cleaned = clean_text("## Climate Change **Overview** 🌍 [source](https://example.test)")
        self.assertIn("Climate Change Overview", cleaned)
        self.assertNotIn("##", cleaned)
        self.assertNotIn("🌍", cleaned)

    def test_extract_document_text_keeps_full_content(self):
        sample = "Climate change continues to affect ecosystems worldwide. " * 25
        extracted = extract_document_text(sample, file_type="text")
        self.assertGreater(len(extracted), 200)
        self.assertIn("ecosystems worldwide", extracted)
        self.assertNotIn("[truncated]", extracted)

    def test_guardrail_with_mock_model(self):
        result = guardrail_check(SAMPLE_TEXT, "", "Reading", lambda **_: json.dumps(SAFE_RESPONSE))
        self.assertTrue(result["passed"])

    def test_backend_request_and_response(self):
        response = Mock(status_code=200)
        response.json.return_value = {"quizId": "test-quiz"}
        response.raise_for_status.return_value = None
        with patch("AI_quiz.tools.requests.post", return_value=response) as request:
            result = post_to_sql_backend({"Title": "Test"}, "http://localhost:5000/api/quiz/save")
        self.assertEqual(result["quizId"], "test-quiz")
        request.assert_called_once()

    def test_exports_and_chart(self):
        with tempfile.TemporaryDirectory() as directory:
            quiz = {
                "Title": "Test Quiz",
                "QuestionGroups": [{
                    "Instruction": "Answer the question",
                    "Questions": [{
                        "Content": "What is renewable energy?",
                        "CorrectAnswer": "Solar power",
                        "Explanation": "It comes from renewable sources.",
                    }],
                }],
            }
            word_path = export_to_word(quiz, str(Path(directory) / "test.docx"))
            excel_path = export_to_excel(quiz, str(Path(directory) / "test.xlsx"))
            chart_path = generate_writing_chart(
                "bar", "Test Chart", ["2024"], {"Rate": [10]},
                str(Path(directory) / "chart.png"),
            )
            self.assertTrue(Path(word_path).exists())
            self.assertTrue(Path(excel_path).exists())
            self.assertTrue(Path(chart_path).exists())

    def test_ocr_with_generated_image(self):
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            self.skipTest("Pillow is not installed")
        image = Image.new("RGB", (900, 180), "white")
        ImageDraw.Draw(image).text((30, 50), "IELTS renewable energy reading", fill="black")
        result = ocr_image_to_text(image)
        if result.startswith("[OCR_ERROR]"):
            self.skipTest(result)
        self.assertIn("IELTS", result.upper())


class TestPipelineSteps(unittest.TestCase):
    def test_step_1_ingest_text(self):
        result = ingest_node(make_state())
        self.assertEqual(result["status"], "PROCESSING")
        self.assertIn("Universities", result["extracted_text"])

    def test_step_2_guardrail(self):
        result = guardrail_node(make_state())
        self.assertTrue(result["guardrail_passed"])

    def test_step_3_preprocess(self):
        result = preprocess_node(make_state(extracted_text="## **Climate** 🌍"))
        self.assertEqual(result["cleaned_text"], "Climate")

    def test_step_4_summarizer_and_orchestrator(self):
        summary = summarizer_node(make_state())
        self.assertEqual(summary["detected_topic"], "Environment & Renewable Energy")
        bronze = orchestrator_node(make_state(selected_skill="All", user_tier="Bronze"))
        gold = orchestrator_node(make_state(selected_skill="All", user_tier="Gold"))
        self.assertEqual(bronze["allocated_teachers"], ["Reading", "Listening"])
        self.assertEqual(len(gold["allocated_teachers"]), 4)

    def test_step_4_reading_and_listening_teachers(self):
        reading = reading_teacher_node(make_state())
        listening = listening_teacher_node(make_state())
        self.assertLessEqual(len(reading["reading_result"]["QuestionGroups"]), 3)
        self.assertTrue(listening["listening_result"]["ListeningSection"]["Transcript"])

    def test_step_4_writing_teacher(self):
        with tempfile.TemporaryDirectory() as directory:
            result = writing_teacher_node(make_state(tool_params={
                "chart_output_path": str(Path(directory) / "writing.png")
            }))
            chart_path = result["writing_result"]["WritingSection"]["Task1"]["ChartImagePath"]
            self.assertTrue(Path(chart_path).exists())

    def test_step_4_speaking_teacher_uses_mock_search(self):
        with patch("AI_quiz.graph.search_web_tool", return_value=[{
            "url": "https://example.test", "title": "Example", "snippet": "IELTS"
        }]):
            from AI_quiz.graph import speaking_teacher_node
            result = speaking_teacher_node(make_state())
        self.assertEqual(result["speaking_result"]["WebSource"], "https://example.test")


class TestApiContract(unittest.TestCase):
    def test_health_endpoint(self):
        response = TestClient(app).get("/api/quiz/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "Healthy")

    def test_missing_document_returns_validation_error(self):
        response = TestClient(app).post("/api/quiz/generate", json={"input_type": "image"})
        self.assertEqual(response.status_code, 422)
        self.assertTrue(response.json()["detail"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
