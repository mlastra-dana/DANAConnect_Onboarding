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
