#!/usr/bin/env python3
"""Copy one supplied split APK set into a fresh analysis directory."""

import argparse
import hashlib
import json
from pathlib import Path
import stat
import sys
import zipfile

from ipa import check_zip_directory, safe_parts


MAX_APKS = 512
MAX_APK_BYTES = 2 * 1024 * 1024 * 1024
MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
MAX_CONTAINER_BYTES = 8 * 1024 * 1024 * 1024


def checked_archive(path):
    with path.open("rb") as stream:
        check_zip_directory(stream, path.stat().st_size)
    archive = zipfile.ZipFile(path)
    try:
        names = set()
        for info in archive.infolist():
            safe_parts(info)
            name = info.filename.casefold()
            if name in names:
                raise ValueError("Repeated ZIP entry names are not supported.")
            names.add(name)
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError("ZIP links and special files are not supported.")
            if info.flag_bits & 1:
                raise ValueError("Encrypted ZIP entries are not supported.")
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                raise ValueError("Only stored or deflated ZIP entries are supported.")
        return archive
    except Exception:
        archive.close()
        raise


def digest(path, maximum=MAX_CONTAINER_BYTES):
    result = hashlib.sha256()
    length = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            length += len(chunk)
            if length > maximum:
                raise ValueError("Input grew beyond its size budget while hashing.")
            result.update(chunk)
    return result.hexdigest()


def copy_part(stream, destination, expected):
    result = hashlib.sha256()
    length = 0
    with destination.open("xb") as output:
        while chunk := stream.read(1024 * 1024):
            length += len(chunk)
            if length > expected or length > MAX_APK_BYTES:
                raise ValueError("APK stream exceeds its declared size or the 2 GiB limit.")
            result.update(chunk)
            output.write(chunk)
    if length != expected:
        raise ValueError("APK stream length does not match its declared size.")
    with checked_archive(destination) as apk:
        if "AndroidManifest.xml" not in apk.namelist():
            raise ValueError("Each APK part must contain AndroidManifest.xml.")
    return {"path": str(destination), "sha256": result.hexdigest(), "bytes": length}


def prepare(source, output):
    source = Path(source).absolute()
    output = Path(output).absolute()
    if source.is_symlink():
        raise ValueError("Split input must not be a symbolic link.")
    archive = None
    if source.is_dir():
        paths = []
        count = 0
        for item in source.iterdir():
            count += 1
            if count > 100_000:
                raise ValueError("Split directory entry budget exceeded.")
            if item.suffix.lower() == ".apk":
                if item.is_symlink() or not item.is_file():
                    raise ValueError("Each APK part must be a regular file, not a link.")
                paths.append(item)
                if len(paths) > MAX_APKS:
                    raise ValueError("At most 512 APK parts are supported.")
        paths.sort(key=lambda path: path.name.casefold())
        entries = [(path, path.stat().st_size) for path in paths]
        identity = {"path": str(source), "kind": "directory"}
    else:
        if not source.is_file() or source.suffix.lower() not in (".apks", ".xapk"):
            raise ValueError("Split input must be a flat APK directory, .apks or .xapk archive.")
        if source.stat().st_size > MAX_CONTAINER_BYTES:
            raise ValueError("Split archive exceeds the 8 GiB container limit.")
        before = digest(source)
        archive = checked_archive(source)
        if any(info.filename.rsplit("/", 1)[-1].casefold() == "toc.pb" for info in archive.infolist()):
            archive.close()
            raise ValueError("Bundletool archives contain device variants. First use bundletool extract-apks with a device specification, then analyze that directory.")
        entries = [(info, info.file_size) for info in archive.infolist() if info.filename.lower().endswith(".apk") and not info.is_dir()]
        identity = {"path": str(source), "kind": source.suffix[1:].lower(), "sha256": before, "bytes": source.stat().st_size}
    try:
        if not entries or len(entries) > MAX_APKS:
            raise ValueError("Supply between 1 and 512 APK parts in a single flat directory or archive.")
        if any(size <= 0 or size > MAX_APK_BYTES for _, size in entries) or sum(size for _, size in entries) > MAX_TOTAL_BYTES:
            raise ValueError("Split APKs exceed the 2 GiB per APK or 4 GiB total input budget.")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.mkdir()
        inputs = output / "inputs"
        inputs.mkdir()
        parts = []
        for index, (entry, size) in enumerate(entries):
            destination = inputs / f"part-{index:03d}.apk"
            if archive:
                with archive.open(entry) as stream:
                    part = copy_part(stream, destination, size)
                part["source"] = entry.filename
            else:
                with entry.open("rb") as stream:
                    part = copy_part(stream, destination, size)
                part["source"] = str(entry)
                if part["sha256"] != digest(entry, MAX_APK_BYTES):
                    raise ValueError("An APK input changed while it was copied.")
            parts.append(part)
        if archive and before != digest(source):
            raise ValueError("The split archive changed while it was copied.")
        return {"input": identity, "parts": parts}
    finally:
        if archive:
            archive.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.input, args.output)))
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"Cannot prepare split APKs: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
