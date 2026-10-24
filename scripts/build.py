"""Package reviewed extension files and LICENSE; no dependencies or downloads."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
source = root / "extension"
manifest = json.loads((source / "manifest.json").read_text())
assert manifest["permissions"] == ["compose", "storage"]
assert manifest["version"] == json.loads((root / "package.json").read_text())["version"]
out = root / "dist" / "owl.xpi"
out.parent.mkdir(exist_ok=True)
files = [("LICENSE", (root / "LICENSE").read_bytes())]
for file in sorted(source.rglob("*")):
    if file.is_file():
        assert file.suffix in {".json", ".js", ".html", ".css", ".svg"}, file
        files.append((file.relative_to(source).as_posix(), file.read_bytes()))
with ZipFile(out, "w", compression=ZIP_DEFLATED) as archive:
    for name, contents in files:
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, contents)
print(out.relative_to(root))
