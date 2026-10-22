import base64
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError


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


class ChileRegressionTests(unittest.TestCase):
    def test_chile_identity_and_back_are_preserved(self):
        self.assertIn("cl", validation.SUPPORTED_COUNTRIES)
        self.assertIn("documentoIdentidadReverso", validation.IDENTITY_EXTRACTION_SLOTS)
        identity = validation.normalize_extracted_identity({"run": "12.345.678-9", "documentNumber": "123456789"})
        self.assertEqual(identity["run"], "12.345.678-9")
        result = validation.apply_chile_back_comparison(
            country="cl", slot="documentoIdentidadReverso",
            analysis={"status": "valid", "extractedIdentity": {"run": "98.765.432-1"}},
            expected_identity=identity,
        )
        self.assertEqual(result["status"], "error")


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
            "DANA_TOKEN_AUDIT_PROJECT_ID": "207867", "DANA_STATIC_DATA": '{"UNRELATED":"value"}',
        })
        self.env.start()
        self.rest_patch = patch.object(validation, "start_dana_conversation", return_value={"success": True})
        self.rest = self.rest_patch.start()
        self.smtp_patch = patch.object(validation.smtplib, "SMTP", side_effect=AssertionError("SMTP must not be used"))
        self.smtp = self.smtp_patch.start()

    def tearDown(self):
        self.smtp_patch.stop()
        self.rest_patch.stop()
        self.env.stop()
        validation.TOKEN_USAGE.reset(self.usage_token)
        validation.TOKEN_AUDIT_CONTEXT.reset(self.audit_token)

    def test_audit_uses_exact_fields_and_separate_project(self):
        result = validation.response(200, {"status": "valid"})
        project, fields = self.rest.call_args.args
        self.assertEqual(project, "207867")
        self.assertEqual(set(fields), {"AUDIT_ID", "ONBOARDING_ID", "DOCUMENT", "FILENAME", "LAMBDA_NAME", "MODEL_ID", "LLAMADAS", "RESULTADO_DOCUMENT", "TOKEN_INPUT", "TOKEN_OUTPUT", "TOKENS_TOTALES"})
        self.assertEqual(fields["ONBOARDING_ID"], "application-1")
        self.assertEqual(fields["TOKENS_TOTALES"], "120")
        self.assertEqual(json.loads(result["body"])["status"], "valid")
        validation.response(200, {"status": "valid"})
        self.assertEqual(self.rest.call_count, 1)
        self.smtp.assert_not_called()

    def test_audit_failure_does_not_change_validation(self):
        self.rest.side_effect = RuntimeError("unavailable")
        with self.assertLogs(level="ERROR"):
            result = validation.response(200, {"status": "valid"})
        self.assertEqual(json.loads(result["body"])["status"], "valid")
        self.assertEqual(result["statusCode"], 200)

    def test_each_document_sends_audit_before_any_final_submission(self):
        with patch.object(validation, "submit_onboarding_via_rest") as final_send, patch.object(validation, "run_bedrock_classification") as classify, patch.object(validation, "run_bedrock_validation") as validate:
            for index, slot in enumerate(("documentoFiscal", "documentoIdentidad"), start=1):
                classify.return_value = {"detected_document_type": slot, "detected_country": "ve", "confidence": 0.99}
                validate.return_value = {"status": "valid", "document_type_match": True, "summary": "Accepted"}
                payload = {
                    "file_name": f"document-{index}.pdf", "content_type": "application/pdf",
                    "file_base64": base64.b64encode(b"%PDF-1.4 fixture").decode(),
                    "country": "ve", "person_type": "natural", "slot": slot,
                    "onboarding_id": "application-1",
                }
                result = validation.lambda_handler({"body": json.dumps(payload)}, None)
                self.assertEqual(result["statusCode"], 200)
                self.assertEqual(json.loads(result["body"])["status"], "valid")
                self.assertEqual(self.rest.call_count, index)
            fields = [call.args[1] for call in self.rest.call_args_list]
            self.assertEqual([row["DOCUMENT"] for row in fields], ["documentoFiscal", "documentoIdentidad"])
            self.assertEqual([row["ONBOARDING_ID"] for row in fields], ["application-1", "application-1"])
            self.assertNotEqual(fields[0]["AUDIT_ID"], fields[1]["AUDIT_ID"])
            final_send.assert_not_called()

    def test_final_submission_does_not_send_token_audit_again(self):
        with patch.object(validation, "submit_onboarding_via_rest", return_value={"ok": True}) as final_send:
            result = validation.lambda_handler({"body": json.dumps({"action": "submitOnboarding"})}, None)
        self.assertEqual(result["statusCode"], 200)
        final_send.assert_called_once()
        self.rest.assert_not_called()
        self.smtp.assert_not_called()
        self.assertNotIn("tokenUsage", json.loads(result["body"]))

    def test_frontend_demo_ids_are_sent_unchanged_to_dana(self):
        with patch.object(validation, "run_bedrock_classification", return_value={"detected_document_type": "documentoFiscal", "detected_country": "ve", "confidence": 0.99}), patch.object(validation, "run_bedrock_validation", return_value={"status": "valid", "document_type_match": True}):
            payload = {
                "file_name": "rif.pdf", "content_type": "application/pdf",
                "file_base64": base64.b64encode(b"%PDF-1.4 fixture").decode(),
                "country": "ve", "person_type": "natural", "slot": "documentoFiscal",
                "onboarding_id": "VE-PN-000123", "audit_id": "VE-PN-000123-RIF-02",
            }
            validation.lambda_handler({"body": json.dumps(payload)}, None)
        fields = self.rest.call_args.args[1]
        self.assertEqual(fields["ONBOARDING_ID"], "VE-PN-000123")
        self.assertEqual(fields["AUDIT_ID"], "VE-PN-000123-RIF-02")

    def test_disabled_audit_does_not_open_connection(self):
        with patch.dict(validation.os.environ, {"DANA_TOKEN_AUDIT_PROJECT_ID": ""}):
            validation.response(200, {"status": "valid"})
        self.rest.assert_not_called()
        self.smtp.assert_not_called()

    def test_unknown_measurement_is_not_written_as_zero(self):
        validation.TOKEN_USAGE.get().update(complete=False, measuredCallCount=0)
        validation.response(500, {"error": "unavailable"})
        fields = self.rest.call_args.args[1]
        self.assertEqual(fields["TOKENS_TOTALES"], "")
        self.assertEqual(fields["RESULTADO_DOCUMENT"], "error_medicion_no_disponible")


class DanaRestTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(validation.os.environ, {
            "DANA_CLIENT_ID": "test-client", "DANA_CLIENT_SECRET": "test-secret",
            "DANA_USERNAME": "test-user", "DANA_PASSWORD": "test-password",
            "DANA_ONBOARDING_PROJECT_ID": "204507", "DANA_TOKEN_AUDIT_PROJECT_ID": "207867",
            "DANA_ID_COMPANY": "venturestars",
        }, clear=True)
        self.env.start()
        self.cache = patch.dict(validation._DANA_TOKEN_CACHE, {"access_token": "", "expires_at": 0, "config": None}, clear=True)
        self.cache.start()

    def tearDown(self):
        self.cache.stop()
        self.env.stop()

    def http_result(self, data):
        context = MagicMock()
        context.__enter__.return_value.status = 200
        context.__enter__.return_value.read.return_value = json.dumps(data).encode()
        return context

    def test_oauth_client_credentials_and_cached_bearer_json_post(self):
        from urllib.parse import parse_qs
        with patch.object(validation, "urlopen", side_effect=[
            self.http_result({"access_token": "test-token", "expires_in": 3600}),
            self.http_result({"wsResult": {"idResult": 23617, "resultDescription": "OK"}}),
            self.http_result({"wsResult": {"idResult": 23618, "resultDescription": "OK"}}),
        ]) as http, patch.object(validation.smtplib, "SMTP") as smtp:
            validation.start_dana_conversation("207867", {"TOKENS_TOTALES": "120"})
            validation.start_dana_conversation("204507", {"NOMBRES": "Demo"})
        self.assertEqual(http.call_count, 3)
        token_request = http.call_args_list[0].args[0]
        self.assertEqual(parse_qs(token_request.data.decode())["grant_type"], ["client_credentials"])
        self.assertTrue(token_request.get_header("Authorization").startswith("Basic "))
        request = http.call_args_list[1].args[0]
        self.assertEqual(request.full_url, "https://appserv.danaconnect.com/api/2.0/rest/conversation/ProjectID/207867/start/data")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(json.loads(request.data), {"TOKENS_TOTALES": "120"})
        self.assertNotIn("command", json.loads(request.data))
        smtp.assert_not_called()

    def test_start_requires_explicit_ws_result_confirmation(self):
        responses = [
            {}, {"success": True}, [], {"wsResult": "invalid"},
            {"wsResult": {"idResult": -1, "resultDescription": "OK"}},
            {"wsResult": {"idResult": 0, "resultDescription": "Rejected"}},
            {"wsResult": {"idResult": True, "resultDescription": "OK"}},
            {"wsResult": {"resultDescription": "OK"}},
        ]
        for result in responses:
            with self.subTest(result=result), patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "dana_json_request", return_value=result):
                with self.assertRaisesRegex(RuntimeError, "sin confirmacion"):
                    validation.start_dana_conversation("207867", {})

    def test_start_logs_safe_http_and_business_confirmation(self):
        result = {"wsResult": {"idResult": 23617, "resultDescription": "OK"}, "private": "private-response"}
        with patch.object(validation, "get_dana_access_token", return_value="private-token"), patch.object(validation, "urlopen", return_value=self.http_result(result)), self.assertLogs(level="INFO") as logs:
            self.assertEqual(validation.start_dana_conversation("207867", {"EMAIL": "private@example.com"}), result)
        output = " ".join(logs.output)
        self.assertIn("http_status=200", output)
        self.assertIn("project_id=207867 id_result=23617 description_status=OK confirmed=True", output)
        for private in ("private-token", "private@example.com", "private-response"):
            self.assertNotIn(private, output)

    def test_start_does_not_log_arbitrary_rejection_text(self):
        result = {"wsResult": {"idResult": -5, "resultDescription": "private@example.com test-secret"}}
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "dana_json_request", return_value=result), self.assertLogs(level="INFO") as logs:
            with self.assertRaises(RuntimeError):
                validation.start_dana_conversation("207867", {})
        output = " ".join(logs.output)
        self.assertIn("id_result=-5", output)
        self.assertIn("confirmed=False", output)
        self.assertNotIn("private@example.com", output)
        self.assertNotIn("test-secret", output)

    def test_response_diagnostic_preserves_envelope_and_redacts_private_values(self):
        request = validation.Request("https://example.com", data=json.dumps({"NOMBRES": "Demo Person"}).encode(), headers={"Authorization": "Bearer private-token"})
        result = {"response": {"code": 42, "message": "Denied Demo Person test-secret private-token private@example.com"}, "access_token": "private-token", "record": {"NOMBRES": "Demo Person"}}
        diagnostic = validation.dana_response_diagnostic(result, request)
        self.assertIn('"code": 42', diagnostic)
        self.assertIn("Denied", diagnostic)
        self.assertIn('"response"', diagnostic)
        for private in ("Demo Person", "test-secret", "private-token", "private@example.com"):
            self.assertNotIn(private, diagnostic)

    def test_nested_rejection_diagnostic_is_logged_before_strict_confirmation(self):
        result = {"response": {"code": 42, "message": "Project not active"}}
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "urlopen", return_value=self.http_result(result)), self.assertLogs(level="INFO") as logs:
            with self.assertRaisesRegex(RuntimeError, "sin confirmacion"):
                validation.start_dana_conversation("204507", {})
        self.assertIn("dana_conversation_response", " ".join(logs.output))
        self.assertIn("Project not active", " ".join(logs.output))

    def test_start_accepts_documented_zero_result_id(self):
        result = {"wsResult": {"idResult": 0, "resultDescription": "OK"}}
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "dana_json_request", return_value=result):
            self.assertEqual(validation.start_dana_conversation("207867", {}), result)

    def test_expired_token_refreshes(self):
        with patch.object(validation, "dana_json_request", return_value={"access_token": "new-token", "expires_in": 3600}) as request:
            validation._DANA_TOKEN_CACHE.update(access_token="expired", expires_at=0)
            self.assertEqual(validation.get_dana_access_token(), "new-token")
        request.assert_called_once()

    def test_oauth_body_auth_and_password_fallback(self):
        from urllib.parse import parse_qs
        with patch.dict(validation.os.environ, {"DANA_OAUTH_AUTH_METHOD": "body"}), patch.object(validation, "dana_json_request", return_value={"access_token": "token"}) as request:
            validation.get_dana_access_token()
            self.assertEqual(parse_qs(request.call_args.args[0].data.decode())["client_secret"], ["test-secret"])
        with patch.dict(validation.os.environ, {"DANA_CLIENT_ID": "", "DANA_CLIENT_SECRET": ""}), patch.object(validation, "dana_json_request", return_value={"access_token": "token"}) as request:
            validation.get_dana_access_token()
            self.assertEqual(parse_qs(request.call_args.args[0].data.decode())["grant_type"], ["password"])

    def test_http_error_is_sanitized_and_not_retried(self):
        with patch.object(validation, "urlopen", side_effect=HTTPError("https://example.com", 401, "sensitive detail", {}, None)) as http:
            with self.assertRaisesRegex(RuntimeError, "^DANA API HTTP 401$"):
                validation.dana_json_request(validation.Request("https://example.com"))
        http.assert_called_once()

    def test_api_rejection_on_http_200_is_failure(self):
        with patch.object(validation, "urlopen", return_value=self.http_result({"success": False, "error": "rejected"})):
            with self.assertRaisesRegex(RuntimeError, "rechazo"):
                validation.dana_json_request(validation.Request("https://example.com"))

    def test_invalid_json_is_failure(self):
        result = self.http_result({})
        result.__enter__.return_value.read.return_value = b"<html>error</html>"
        with patch.object(validation, "urlopen", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "JSON invalida"):
                validation.dana_json_request(validation.Request("https://example.com"))

    def test_rest_submission_uploads_then_starts_correct_project_without_smtp(self):
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "upload_files_and_merge_data", return_value=({"NOMBRES": "Demo", "DOCUMENTO_IDENTIDAD": "file-1"}, [{"fileID": "file-1"}])) as upload, patch.object(validation, "start_dana_conversation", return_value={"success": True}) as start, patch.object(validation.smtplib, "SMTP") as smtp:
            result = validation.submit_onboarding_via_rest({"data": {"NOMBRES": "Demo"}, "files": []})
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "rest")
        self.assertEqual(result["projectId"], "204507")
        start.assert_called_once_with("204507", {"NOMBRES": "Demo", "DOCUMENTO_IDENTIDAD": "file-1"})
        upload.assert_called_once()
        smtp.assert_not_called()

    def test_oauth_failure_prevents_upload_and_start(self):
        with patch.object(validation, "get_dana_access_token", side_effect=RuntimeError("unavailable")), patch.object(validation, "upload_files_and_merge_data") as upload, patch.object(validation, "start_dana_conversation") as start, self.assertLogs(level="ERROR"):
            result = validation.submit_onboarding_via_rest({"data": {"NOMBRES": "Demo"}})
        self.assertEqual(result["stage"], "oauth")
        self.assertFalse(result["ok"])
        upload.assert_not_called()
        start.assert_not_called()

    def test_file_upload_507_prevents_conversation(self):
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "upload_files_and_merge_data", side_effect=HTTPError("https://example.com", 507, "Insufficient Storage", {}, None)), patch.object(validation, "start_dana_conversation") as start, self.assertLogs(level="ERROR"):
            result = validation.submit_onboarding_via_rest({"data": {"NOMBRES": "Demo"}})
        self.assertEqual(result["stage"], "file_upload")
        self.assertIn("507", result["error"])
        start.assert_not_called()

    def test_start_failure_has_separate_stage(self):
        with patch.object(validation, "get_dana_access_token", return_value="token"), patch.object(validation, "upload_files_and_merge_data", return_value=({"NOMBRES": "Demo"}, [])), patch.object(validation, "start_dana_conversation", side_effect=RuntimeError("unavailable")), self.assertLogs(level="ERROR"):
            result = validation.submit_onboarding_via_rest({"data": {"NOMBRES": "Demo"}})
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "start_conversation")

    def test_files_use_http_credentials_without_smtp_configuration(self):
        self.assertEqual(validation.resolve_file_upload_user("venturestars"), "test-user")
        self.assertEqual(validation.resolve_file_upload_password(), "test-password")

    def test_onboarding_project_cannot_be_audit_project(self):
        with patch.dict(validation.os.environ, {"DANA_ONBOARDING_PROJECT_ID": "207867"}):
            with self.assertRaises(ValueError):
                validation.submit_onboarding_via_rest({"data": {"NOMBRES": "Demo"}})


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
