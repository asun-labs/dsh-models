import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sync_savage", Path(__file__).resolve().parents[1] / "scripts/sync-savage.py")
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncTests(unittest.TestCase):
    def test_directory_uses_actual_image_and_detail_links(self):
        page = sync.Page('''<table><tr><td><a href="ActualIndex.html"><img src="_thumbnails/OtherThumbnail.png" alt="Actual"></a></td>
        <td><a href="ActualIndex.html">Actual Model</a></td><td>A model &amp; parts</td></tr></table>''')
        with patch.object(sync, "fetch", return_value=page):
            rows = sync.directory(sync.ROOT + "Space/Satellites/index.html")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Actual Model")
        self.assertEqual(rows[0]["description"], "A model & parts")
        self.assertTrue(rows[0]["thumbnailUrl"].endswith("OtherThumbnail.png"))
        self.assertEqual(rows[0]["category"], "Space")

    def test_detail_reads_download_href_instead_of_guessing_name(self):
        page = sync.Page('<a href="https://gitlab.nps.edu/Savage/Other.x3d">version control</a><a href="https://savage.nps.edu/X3dValidator?url=foo.x3d">validate</a><a href="Different.x3d">X3D</a>')
        with patch.object(sync, "fetch", return_value=page):
            model = sync.detail({"id": "Space/Satellites/Example", "sourcePage": sync.ROOT + "Space/Satellites/ExampleIndex.html"})
        self.assertTrue(model["modelUrl"].endswith("/Different.x3d"))

    def test_entry_without_thumbnail_is_not_dropped(self):
        page = sync.Page('<table><tr><td></td><td><a href="NoImageIndex.html">No Image</a></td><td>Model without screenshot</td></tr></table>')
        with patch.object(sync, 'fetch', return_value=page):
            rows = sync.directory(sync.ROOT + 'Space/Satellites/index.html')
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['thumbnailUrl'])

    def test_missing_download_and_foreign_resource_fail(self):
        with patch.object(sync, "fetch", return_value=sync.Page("<p>No model</p>")):
            with self.assertRaises(ValueError):
                sync.detail({"sourcePage": sync.ROOT + "Space/ExampleIndex.html"})
        for url in ["https://example.com/model.x3d", "javascript:alert(1)", "../../../secret", "http://savage.nps.edu/Savage/a.x3d"]:
            with self.assertRaises(ValueError):
                sync.official_url(sync.ROOT, url)

    def test_forbidden_source_retains_entry_without_inventing_download(self):
        error = sync.HTTPError(sync.ROOT, 403, 'Forbidden', {}, None)
        with patch.object(sync, 'fetch', side_effect=error):
            row = sync.detail({'id': 'example', 'sourcePage': sync.ROOT + 'ExampleIndex.html'})
        self.assertIsNone(row['modelUrl'])
        self.assertIn('HTTP 403', row['downloadUnavailable'])


if __name__ == "__main__":
    unittest.main()
