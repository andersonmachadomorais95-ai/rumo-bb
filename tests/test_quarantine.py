import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

test_data = tempfile.TemporaryDirectory(prefix="BB quarantine test ")
os.environ["BB_DATA_DIR"] = test_data.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "supabase"))
import upload_quarantine
import promote_quarantine


class QuarantineImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = upload_quarantine.build_rows()

    def test_only_quarantined_questions_are_included(self):
        self.assertEqual(len(self.rows), 5978)
        self.assertEqual(len({row["id"] for row in self.rows}), len(self.rows))
        self.assertTrue(
            all(row["payload"]["question"]["status"] == "quarentena" for row in self.rows)
        )
        extracted = [
            row for row in self.rows
            if any("extraidas-" in source.get("arquivo_original", "") for source in row["payload"]["sources"])
            and all("extraidas-" in source.get("arquivo_original", "") for source in row["payload"]["sources"])
        ]
        self.assertEqual(len(extracted), 851)
        self.assertTrue(
            all("extracao_automatica_pendente" in row["payload"]["question"]["motivos"] for row in extracted)
        )

    def test_quarantined_questions_cannot_be_practiced(self):
        self.assertTrue(all(row["payload"]["practice_enabled"] is False for row in self.rows))

    def test_related_content_is_attached_to_question(self):
        self.assertTrue(all(row["payload"]["question"]["id"] == row["id"] for row in self.rows))
        self.assertTrue(all("alternatives" in row["payload"] for row in self.rows))

    def test_practice_promotion_excludes_unresolved_visuals_and_family_conflicts(self):
        rows = promote_quarantine.build_rows()
        self.assertEqual(len(rows), 5003)
        extracted_ids = {
            row["id"]
            for row in self.rows
            if any("extraidas-" in source.get("arquivo_original", "") for source in row["payload"]["sources"])
            and all("extraidas-" in source.get("arquivo_original", "") for source in row["payload"]["sources"])
        }
        self.assertTrue(extracted_ids.isdisjoint({row["id"] for row in rows}))
        self.assertTrue(
            all(
                not {
                    "familia_com_gabaritos_divergentes",
                    "elemento_visual_ausente",
                    "contexto_ou_visual_a_conferir",
                    "extracao_automatica_pendente",
                }.intersection(row["payload"]["motivos"])
                for row in rows
            )
        )

    def test_upload_uses_service_role_bearer_auth(self):
        requests = []

        def capture_request(request, timeout):
            requests.append(request)
            return contextlib.nullcontext()

        with (
            patch.object(sys, "argv", ["upload_quarantine.py", "https://example.supabase.co"]),
            patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": "test-service-key"}),
            patch.object(upload_quarantine.urllib.request, "urlopen", side_effect=capture_request),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            upload_quarantine.main()

        self.assertEqual(len(requests), 120)
        self.assertEqual(requests[0].get_header("Authorization"), "Bearer test-service-key")
        self.assertEqual(requests[0].get_header("Apikey"), "test-service-key")


if __name__ == "__main__":
    unittest.main()
