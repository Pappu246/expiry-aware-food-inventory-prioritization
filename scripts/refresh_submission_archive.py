#!/usr/bin/env python3
"""Refresh and validate the curated A-6 ZIP from the selected Git checkout.

The checked-in PDF/DOCX/PPTX report assets are preserved. All tracked repository
files are copied into the ZIP under the existing project-root prefix so the
submitted source and Markdown guides cannot silently drift behind the source repo.
"""
from __future__ import annotations

import hashlib
import io
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "submission" / "A6_Submission_Artifacts.zip"
CORE_SOURCE_FILES = (
    "src/engine.c",
    "src/inventory_app.c",
    "include/fefo/engine.h",
    "tests/test_main.c",
    "tests/inventory_app_smoke.py",
    "tests/showcase.contract.test.js",
    "website/server.js",
    "website/lib/inventory.js",
    "website/public/index.html",
    "website/tests/server.integration.test.js",
    "Makefile",
    "CI_VERIFICATION.md",
    "PACKAGE_README.md",
    "START_HERE.md",
)
REQUIRED_DELIVERABLES = (
    "a6_project_report.docx",
    "a6_project_report.pdf",
    "a6_project_presentation.pptx",
    "a6_project_presentation.pdf",
    "a6_viva_notes.docx",
    "a6_viva_notes.pdf",
)


def fail(message: str) -> None:
    raise SystemExit(f"SUBMISSION ARCHIVE CHECK FAILED: {message}")


def safe_name(name: str) -> str:
    if "\\" in name or name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        fail(f"unsafe archive member path: {name!r}")
    path = PurePosixPath(name)
    if any(part == ".." for part in path.parts):
        fail(f"path traversal in archive member: {name!r}")
    return name


def tracked_paths() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    paths = [p.replace("\\", "/") for p in result.decode("utf-8").split("\0") if p]
    return sorted(p for p in paths if p != "submission/A6_Submission_Artifacts.zip")


def find_member(names: list[str], suffix: str) -> str:
    candidates = [n for n in names if n == suffix or n.endswith("/" + suffix)]
    if len(candidates) != 1:
        fail(f"expected exactly one packaged {suffix!r}; found {candidates}")
    return candidates[0]


def check_office_file(filename: str, data: bytes, kind: str) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as office:
            bad = office.testzip()
            if bad:
                fail(f"{filename} has a corrupt embedded Office member: {bad}")
            members = set(office.namelist())
    except (zipfile.BadZipFile, OSError) as exc:
        fail(f"{filename} is not a valid Office Open XML file: {exc}")
    required = {"[Content_Types].xml"}
    required.add("word/document.xml" if kind == "docx" else "ppt/presentation.xml")
    missing = required - members
    if missing:
        fail(f"{filename} is missing required {kind.upper()} parts: {sorted(missing)}")


def verify_archive(path: Path, prefix: str, tracked: list[str]) -> None:
    with zipfile.ZipFile(path, "r") as archive:
        bad = archive.testzip()
        if bad:
            fail(f"archive CRC failed at member {bad!r}")
        info_by_name = {}
        for info in archive.infolist():
            safe_name(info.filename)
            key = info.filename.rstrip("/")
            if key in info_by_name:
                fail(f"duplicate archive path: {key}")
            info_by_name[key] = info
        files = {name: archive.read(info) for name, info in info_by_name.items() if not info.is_dir()}

    for required in REQUIRED_DELIVERABLES:
        candidates = [name for name in files if PurePosixPath(name).name.lower() == required]
        if len(candidates) != 1:
            fail(f"expected exactly one {required}; found {candidates}")

    pdf_names = [name for name in files if PurePosixPath(name).suffix.lower() == ".pdf"]
    docx_names = [name for name in files if PurePosixPath(name).suffix.lower() == ".docx"]
    pptx_names = [name for name in files if PurePosixPath(name).suffix.lower() == ".pptx"]
    if not pdf_names or not docx_names or not pptx_names:
        fail("archive must include PDF, DOCX and PPTX deliverables")
    for name in pdf_names:
        data = files[name]
        if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-4096:]:
            fail(f"{name} does not have a recognisable PDF header and end marker")
    for name in docx_names:
        check_office_file(name, files[name], "docx")
    for name in pptx_names:
        check_office_file(name, files[name], "pptx")

    for rel in CORE_SOURCE_FILES:
        target = prefix + rel
        if target not in files:
            fail(f"submission source is missing: {target}")
        current = (ROOT / rel).read_bytes()
        if files[target] != current:
            fail(f"packaged file is stale relative to repository: {target}")

    if any(PurePosixPath(name).suffix.lower() in {".java", ".class"} for name in files):
        fail("the C11 submission archive must not contain stale Java source/class files")

    print(f"Validated {len(files)} packaged files; PDF={len(pdf_names)}, DOCX={len(docx_names)}, PPTX={len(pptx_names)}")
    print("Verified current source/docs SHA-256:")
    for rel in CORE_SOURCE_FILES:
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()
        print(f"  {rel}: {digest}")
    print("Submission deliverables:")
    for name in sorted(files):
        if PurePosixPath(name).suffix.lower() in {".pdf", ".docx", ".pptx"}:
            print(f"  {name} ({len(files[name])} bytes)")


def main() -> None:
    if not ARCHIVE.is_file():
        fail(f"archive not found: {ARCHIVE}")
    paths = tracked_paths()
    with zipfile.ZipFile(ARCHIVE, "r") as source:
        infos = source.infolist()
        names = [info.filename for info in infos]
        for name in names:
            safe_name(name)
        source_members = [name for name in names if name == "src/engine.c" or name.endswith("/src/engine.c")]
        if len(source_members) == 1:
            prefix = source_members[0][:-len("src/engine.c")]
        elif len(source_members) > 1:
            fail(f"multiple existing src/engine.c files make the package root ambiguous: {source_members}")
        else:
            # Older ZIPs may contain only the report assets. Infer the shared project
            # folder from the six required deliverables, then add the missing source tree.
            deliverable_paths = {}
            for required in REQUIRED_DELIVERABLES:
                candidates = [name for name in names if PurePosixPath(name).name.lower() == required]
                if len(candidates) != 1:
                    fail(f"cannot establish package root: expected exactly one {required}; found {candidates}")
                deliverable_paths[required] = candidates[0]
            parent_parts = [PurePosixPath(name).parent.parts for name in deliverable_paths.values()]
            common_parts = []
            for components in zip(*parent_parts):
                if len(set(components)) != 1:
                    break
                common_parts.append(components[0])
            prefix = "/".join(common_parts)
            if prefix:
                prefix += "/"
            print("Existing ZIP had no C11 source tree; adding repository files at package prefix " + repr(prefix))

        existing = {}
        removed_stale_language_files = 0
        for info in infos:
            key = info.filename.rstrip("/")
            if key in existing:
                fail(f"duplicate archive path before refresh: {key}")
            # The submitted project is C11; discard stale Java build/source artifacts.
            if PurePosixPath(key).suffix.lower() in {".java", ".class"}:
                removed_stale_language_files += 1
                continue
            existing[key] = (info, source.read(info))

    refresh_count = 0
    add_count = 0
    for rel in paths:
        target = prefix + rel
        data = (ROOT / rel).read_bytes()
        key = target.rstrip("/")
        if key in existing:
            info, previous = existing[key]
            if previous != data:
                existing[key] = (info, data)
                refresh_count += 1
        else:
            info = zipfile.ZipInfo(target)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            existing[key] = (info, data)
            add_count += 1

    with tempfile.NamedTemporaryFile(prefix="submission-artifacts-", suffix=".zip", dir=ARCHIVE.parent, delete=False) as tmp:
        temporary_path = Path(tmp.name)
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target_zip:
            for name, (info, data) in sorted(existing.items()):
                target_zip.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        verify_archive(temporary_path, prefix, paths)
        temporary_path.replace(ARCHIVE)
    finally:
        if temporary_path.exists():
            temporary_path.unlink(missing_ok=True)

    print(f"Refreshed submission archive: {refresh_count} files updated, {add_count} files added, {removed_stale_language_files} stale Java artifacts removed.")
    print(f"Archive size: {ARCHIVE.stat().st_size} bytes")
    # Verify the exact on-disk archive after replacing the original.
    verify_archive(ARCHIVE, prefix, paths)


if __name__ == "__main__":
    main()
