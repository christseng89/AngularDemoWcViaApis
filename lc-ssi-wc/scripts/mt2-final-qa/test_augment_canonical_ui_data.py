import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("augment-canonical-ui-data.py")
SPEC = importlib.util.spec_from_file_location("augment_canonical_ui_data", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise AssertionError("cannot load MT2 UI data generator")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Mt2UiDataGeneratorTest(unittest.TestCase):
    def test_generated_interbank_route_is_purpose_built(self) -> None:
        route = MODULE.build_mt2_route(
            currency="EUR",
            bic="DEUTDEFF",
            bank={"name": "Deutsche Bank AG", "country": "DE"},
            index=1,
            debit_account_id="MT2-EUR-DEUTDEFF-DEBIT-V1",
        )

        self.assertEqual(route["routePurpose"], "INTERBANK_TRANSFER")


if __name__ == "__main__":
    unittest.main()
