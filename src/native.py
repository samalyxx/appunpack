#!/usr/bin/env python3
"""Validate an APK archive or extract one selected Android native library."""

import argparse
import json
from pathlib import Path
import re
import sys
import zipfile

from splits import checked_archive, digest


MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024


def inspect_apk(path, *, extract_all=False):
    path = Path(path)
    if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("APK must be a regular file of at most 512 MiB.")
    archive = checked_archive(path, allow_case_collisions=not extract_all)
    try:
        total = 0
        libraries = []
        library_chars = 0
        for info in archive.infolist():
            total += info.file_size
            if info.file_size > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES:
                raise ValueError("APK exceeds the 512 MiB entry or 4 GiB expanded-size budget.")
            for part in info.filename.rstrip("/").split("/"):
                stem = part.split(".", 1)[0].upper()
                if (re.search(r'[<>"|?*\x00-\x1f]', part) or part.endswith((".", " "))
                        or stem in {"CON", "PRN", "AUX", "NUL"}
                        or re.fullmatch(r"(?:COM|LPT)[1-9]", stem)):
                    raise ValueError("APK contains a path unsafe on Windows.")
            if re.fullmatch(r"lib/[A-Za-z0-9_-]+/[^/]+\.so", info.filename) and not info.is_dir():
                libraries.append(info.filename)
                library_chars += len(info.filename)
                if len(libraries) > 512 or library_chars > 128 * 1024:
                    raise ValueError("APK exceeds the 512 native-library or 128 KiB library-name budget.")
        if "AndroidManifest.xml" not in archive.namelist():
            raise ValueError("APK has no AndroidManifest.xml.")
        return archive, {"entries": len(archive.infolist()), "expandedBytes": total, "libraries": libraries}
    except Exception:
        archive.close()
        raise


def extract_library(apk, member, destination):
    before = digest(Path(apk))
    archive, report = inspect_apk(apk)
    with archive:
        if member not in report["libraries"]:
            raise ValueError("Select an existing lib/ABI/NAME.so member; use native-libs to list available paths.")
        info = archive.getinfo(member)
        if not 0 < info.file_size <= MAX_FILE_BYTES:
            raise ValueError("Native library exceeds the 512 MiB limit or is empty.")
        copied = 0
        with archive.open(info) as source, Path(destination).open("xb") as output:
            while chunk := source.read(1024 * 1024):
                copied += len(chunk)
                if copied > info.file_size or copied > MAX_FILE_BYTES:
                    raise ValueError("Native library exceeds its declared size or extraction budget.")
                output.write(chunk)
        if copied != info.file_size or before != digest(Path(apk)):
            raise ValueError("APK changed or library size does not match its archive entry.")
    return {"member": member, "apkSha256": before, "bytes": copied}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("check", "check-decode", "extract"))
    parser.add_argument("apk")
    parser.add_argument("member", nargs="?")
    parser.add_argument("destination", nargs="?")
    args = parser.parse_args()
    if args.mode in ("check", "check-decode"):
        if args.member or args.destination:
            parser.error("check accepts only an APK path")
        archive, report = inspect_apk(args.apk, extract_all=args.mode == "check-decode")
        archive.close()
    else:
        if not args.member or not args.destination:
            parser.error("extract requires a member and destination")
        report = extract_library(args.apk, args.member, args.destination)
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"appunpack: {error}", file=sys.stderr)
        sys.exit(1)
