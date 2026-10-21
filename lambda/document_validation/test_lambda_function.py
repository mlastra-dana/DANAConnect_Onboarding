import base64
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


boto_stub = types.ModuleType("boto3")
boto_stub.client = MagicMock(side_effect=lambda *args, **kwargs: MagicMock())
config_stub = types.ModuleType("botocore.config")
config_stub.Config = MagicMock()
spec = importlib.util.spec_from_file_location("validation_under_test", Path(__file__).with_name("lambda_function.py"))
validation = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"boto3": boto_stub, "botocore": types.ModuleType("botocore"), "botocore.config": config_stub}):
    spec.loader.exec_module(validation)


class TokenUsageTests(unittest.TestCase):
    def setUp(self):
        self.context_token = validation.TOKEN_USAGE.set({
            "modelId": "test-model", "inputTokens": 0, "outputTokens": 0, "totalTokens": 0,
            "callCount": 0, "measuredCallCount": 0, "complete": True,
        })

    def tearDown(self):
        validation.TOKEN_USAGE.reset(self.context_token)

    def test_sums_all_calls_without_changing_model_response(self):
        result = {"usage": {"inputTokens": 100, "outputTokens": 20, "totalTokens": 120}}
        with patch.object(validation.BEDROCK_CLIENT, "converse", return_value=result):
            for phase in ("classification", "validation"):
                self.assertIs(validation.converse_with_usage(phase=phase, modelId="test-model"), result)
        body = json.loads(validation.response(200, {"status": "valid"})["body"])
        self.assertEqual(body["tokenUsage"]["totalTokens"], 240)
        self.assertEqual(body["tokenUsage"]["inputTokens"], 200)
        self.assertEqual(body["tokenUsage"]["outputTokens"], 40)
        self.assertEqual(body["tokenUsage"]["callCount"], 2)
        self.assertEqual(body["tokenUsage"]["measuredCallCount"], 2)
        self.assertTrue(body["tokenUsage"]["complete"])

    def test_missing_usage_is_not_reported_as_complete_zero(self):
        with patch.object(validation.BEDROCK_CLIENT, "converse", return_value={}):
            validation.converse_with_usage(phase="classification", modelId="test-model")
        self.assertFalse(validation.TOKEN_USAGE.get()["complete"])
        self.assertEqual(validation.TOKEN_USAGE.get()["measuredCallCount"], 0)

    def test_failure_preserves_measured_tokens_in_error_response(self):
        with patch.object(validation.BEDROCK_CLIENT, "converse", side_effect=[
            {"usage": {"inputTokens": 100, "outputTokens": 20, "totalTokens": 120}}, RuntimeError("unavailable")
        ]):
            validation.converse_with_usage(phase="classification", modelId="test-model")
            with self.assertRaises(RuntimeError):
                validation.converse_with_usage(phase="validation", modelId="test-model")
        usage = json.loads(validation.response(500, {"error": "unavailable"})["body"])["tokenUsage"]
        self.assertEqual(usage["totalTokens"], 120)
        self.assertEqual(usage["callCount"], 2)
        self.assertFalse(usage["complete"])

    def test_warm_invocation_does_not_leak_usage(self):
        validation.TOKEN_USAGE.get()["totalTokens"] = 999
        result = validation.lambda_handler({"requestContext": {"http": {"method": "OPTIONS"}}}, None)
        self.assertNotIn("tokenUsage", json.loads(result["body"]))


class TokenAuditTests(unittest.TestCase):
    def setUp(self):
        self.usage_token = validation.TOKEN_USAGE.set({
            "modelId": "test-model", "inputTokens": 100, "outputTokens": 20, "totalTokens": 120,
            "callCount": 2, "measuredCallCount": 2, "complete": True,
        })
        self.audit_token = validation.TOKEN_AUDIT_CONTEXT.set({
            "auditId": "attempt-1", "onboardingId": "application-1", "document": "documentoFiscal", "fileName": "rif.pdf",
        })
        self.env = patch.dict(validation.os.environ, {
            "DANA_TOKEN_AUDIT_PROJECT_ID": "207867", "DANA_ID_COMPANY": "test-company",
            "DANA_ID_CONVERSATION": "original-project", "DANA_SMTP_USER": "test-user",
            "DANA_SMTP_PASS": "test-password", "DANA_FROM": "test@example.com",
            "DANA_CC": "must-not-copy@example.com", "DANA_STATIC_DATA": '{"UNRELATED":"value"}',
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        validation.TOKEN_USAGE.reset(self.usage_token)
        validation.TOKEN_AUDIT_CONTEXT.reset(self.audit_token)

    def test_audit_uses_exact_fields_and_separate_recipient(self):
        from urllib.parse import parse_qs
        with patch.object(validation.smtplib, "SMTP") as smtp:
            smtp.return_value.__enter__.return_value.send_message.return_value = {}
            result = validation.response(200, {"status": "valid"})
            message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
            self.assertEqual(message["To"], "207867@test-company.email-platform.com")
            self.assertIsNone(message["Cc"])
            fields = parse_qs(message.get_content().strip(), keep_blank_values=True)
            self.assertEqual(set(fields), {"command", "AUDIT_ID", "ONBOARDING_ID", "DOCUMENT", "FILENAME", "LAMBDA_NAME", "MODEL_ID", "LLAMADAS", "RESULTADO_DOCUMENT", "TOKEN_INPUT", "TOKEN_OUTPUT", "TOKENS_TOTALES"})
            self.assertEqual(fields["ONBOARDING_ID"], ["application-1"])
            self.assertEqual(fields["TOKENS_TOTALES"], ["120"])
            self.assertEqual(fields["command"], ["StartConversationWithData"])
            self.assertEqual(json.loads(result["body"])["status"], "valid")
            validation.response(200, {"status": "valid"})
            self.assertEqual(smtp.call_count, 1)

    def test_audit_failure_does_not_change_validation(self):
        with patch.object(validation.smtplib, "SMTP", side_effect=RuntimeError("unavailable")), self.assertLogs(level="ERROR"):
            result = validation.response(200, {"status": "valid"})
        self.assertEqual(json.loads(result["body"])["status"], "valid")
        self.assertEqual(result["statusCode"], 200)

    def test_disabled_audit_does_not_open_connection(self):
        with patch.dict(validation.os.environ, {"DANA_TOKEN_AUDIT_PROJECT_ID": ""}), patch.object(validation.smtplib, "SMTP") as smtp:
            validation.response(200, {"status": "valid"})
        smtp.assert_not_called()

    def test_unknown_measurement_is_not_written_as_zero(self):
        from urllib.parse import parse_qs
        validation.TOKEN_USAGE.get().update(complete=False, measuredCallCount=0)
        with patch.object(validation.smtplib, "SMTP") as smtp:
            smtp.return_value.__enter__.return_value.send_message.return_value = {}
            validation.response(500, {"error": "unavailable"})
            message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
        fields = parse_qs(message.get_content().strip(), keep_blank_values=True)
        self.assertEqual(fields["TOKENS_TOTALES"], [""])
        self.assertEqual(fields["RESULTADO_DOCUMENT"], ["error_medicion_no_disponible"])


class ReferenceValidationTests(unittest.TestCase):
    def request(self, slot, person_type="natural", file_bytes=b"%PDF-1.4\nformat fixture", country="ve", **extra):
        payload = {
            "file_name": "reference.pdf",
            "content_type": "application/pdf",
            "file_base64": base64.b64encode(file_bytes).decode(),
            "country": country,
            "person_type": person_type,
            "slot": slot,
            **extra,
        }
        result = validation.lambda_handler({"body": json.dumps(payload)}, None)
        return result["statusCode"], json.loads(result["body"])

    def test_reference_formats_do_not_call_classifier(self):
        with patch.object(validation, "run_bedrock_classification") as classify, patch.object(validation, "extract_natural_bank_reference") as extract:
            for slot, person_type in [("referenciaPersonal", "natural"), ("referenciaComercial", "juridica"), ("referenciaBancaria", "juridica")]:
                with self.subTest(slot=slot):
                    code, result = self.request(slot, person_type)
                    self.assertEqual(code, 200)
                    self.assertEqual(result["status"], "valid")
                    self.assertEqual(result["validationScope"], "file_format")
                    self.assertEqual(result["validityStatus"], "unknown")
                    self.assertFalse(result["document_type_match"])
                    self.assertEqual(result["extractedBankReference"]["institution"], "")
                    self.assertEqual(result["tokenUsage"]["totalTokens"], 0)
                    self.assertEqual(result["tokenUsage"]["callCount"], 0)
                    self.assertTrue(result["tokenUsage"]["complete"])
            classify.assert_not_called()
            extract.assert_not_called()

    def test_unsupported_signature_rejected(self):
        code, result = self.request("referenciaPersonal", file_bytes=b"not a PDF")
        self.assertEqual(code, 400)
        self.assertIn("Formato", result["error"])

    def test_empty_signature_rejected(self):
        with self.assertRaises(ValueError):
            validation.validate_reference_format(file_bytes=b"")

    def test_file_size_limit_preserved(self):
        with patch.object(validation, "MAX_FILE_BYTES", 5):
            code, _ = self.request("referenciaPersonal")
        self.assertEqual(code, 400)

    def test_reference_scope_limited_to_venezuela(self):
        code, _ = self.request("referenciaPersonal", country="pe")
        self.assertEqual(code, 400)

    def test_supported_signatures(self):
        for file_bytes in (b"%PDF-1.4", b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF0000WEBP"):
            with self.subTest(file_bytes=file_bytes):
                self.assertEqual(validation.validate_reference_format(file_bytes=file_bytes)["status"], "valid")

    def test_bank_extraction_only_for_natural(self):
        fields = {"institution": "Banco emisor", "product": "Cuenta corriente", "balanceFigures": "Cuatro cifras bajas"}
        with patch.object(validation, "extract_natural_bank_reference", return_value=fields) as extract:
            code, result = self.request("referenciaBancaria")
            self.assertEqual(code, 200)
            self.assertEqual(result["extractedBankReference"], fields)
            extract.assert_called_once()

    def test_extraction_failure_does_not_reject_format(self):
        with patch.object(validation, "extract_natural_bank_reference", side_effect=RuntimeError("model unavailable")), self.assertLogs(level="ERROR"):
            code, result = self.request("referenciaBancaria")
        self.assertEqual(code, 200)
        self.assertEqual(result["status"], "warning")
        self.assertEqual(result["validationScope"], "file_format")
        self.assertEqual(result["extractedBankReference"]["product"], "")

    def test_bank_extractor_preserves_literal_figures(self):
        text = json.dumps({"institution": " Banco emisor ", "product": " Cuenta de ahorro ", "balanceFigures": " Cinco cifras medias "})
        response = {"output": {"message": {"content": [{"text": text}]}}}
        with patch.object(validation.BEDROCK_CLIENT, "converse", return_value=response):
            fields = validation.extract_natural_bank_reference(file_bytes=b"%PDF-1.4", file_name="ref.pdf", content_type="application/pdf")
        self.assertEqual(fields["balanceFigures"], "Cinco cifras medias")
        self.assertEqual(fields["institution"], "Banco emisor")

    def test_birth_date_normalization(self):
        self.assertEqual(validation.normalize_birth_date("15/04/1990"), "1990-04-15")
        for value in ("31/02/1990", "2999-01-01", "", None, 1990):
            self.assertEqual(validation.normalize_birth_date(value), "")

    def test_identity_fields_are_limited_to_natural_cedula(self):
        identity = {"firstName": "Ana", "lastName": "Perez", "documentNumber": "V-12345678", "birthDate": "15/04/1990", "nationality": "Venezolana"}
        classification = {"detected_document_type": "documentoIdentidad", "detected_country": "ve"}
        for person_type, slot, expected_date in [("natural", "documentoIdentidad", "1990-04-15"), ("juridica", "documentoRepresentante", "")]:
            with self.subTest(person_type=person_type), patch.object(validation, "run_bedrock_classification", return_value=classification.copy()), patch.object(validation, "run_bedrock_validation", return_value={"status": "valid", "document_type_match": True, "extractedIdentity": identity.copy()}):
                code, result = self.request(slot, person_type)
                self.assertEqual(code, 200)
                self.assertEqual(result["extractedIdentity"]["birthDate"], expected_date)
                self.assertEqual(result["extractedIdentity"]["nationality"], "Venezolana" if expected_date else "")

    def test_identity_prompt_instructs_no_guessing(self):
        prompt = validation.build_prompt(file_name="cedula.pdf", content_type="application/pdf", country="ve", slot="documentoIdentidad", raw_slot="documentoIdentidad", person_type="natural", slot_label="Cedula", classification={})
        self.assertIn("No uses fecha de emision ni de vencimiento", prompt)
        self.assertIn("no inventes el pais", prompt)


if __name__ == "__main__":
    unittest.main()
