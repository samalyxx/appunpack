#!/usr/bin/env python3
"""Inspect an IPA without extracting or executing its contents (Python 3.10+)."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import stat
import struct
import sys
import zipfile


MAX_ENTRIES = 100_000
MAX_CENTRAL_BYTES = 16 * 1024 * 1024
MAX_PLIST_BYTES = 2 * 1024 * 1024
MAX_TOTAL_PLIST_BYTES = 8 * 1024 * 1024
MAX_BUNDLES = 256
MAX_TEXT_CHARS = 16_384
MAX_FRAMEWORK_PATH_BYTES = 1024 * 1024
MAX_PLIST_OBJECTS = 32_768


def check_zip_directory(stream, size):
    """Bound central-directory allocation before zipfile builds its entry objects."""
    stream.seek(max(0, size - 65_557))
    tail = stream.read(65_557)
    end = tail.rfind(b"PK\x05\x06")
    if end < 0 or len(tail) - end < 22:
        raise ValueError("Missing ZIP end-of-directory record.")
    _, disk, directory_disk, disk_entries, entries, length, offset, comment = struct.unpack_from("<4s4H2IH", tail, end)
    if end + 22 + comment != len(tail):
        raise ValueError("Unsupported ZIP layout or trailing bytes.")
    absolute_end = size - len(tail) + end
    stream.seek(max(0, absolute_end - 20))
    if stream.read(4) == b"PK\x06\x07" or entries == 0xFFFF or length == 0xFFFFFFFF or offset == 0xFFFFFFFF:
        raise ValueError("ZIP64 archives are not supported by this inspector.")
    if disk or directory_disk or disk_entries != entries:
        raise ValueError("Multi-disk ZIP archives are not supported.")
    if entries > MAX_ENTRIES or length > MAX_CENTRAL_BYTES:
        raise ValueError("ZIP central-directory budget exceeded.")
    if offset + length != absolute_end:
        raise ValueError("Invalid or unsupported ZIP central-directory location.")
    stream.seek(offset)
    directory = stream.read(length)
    position = count = 0
    while position < length:
        if position + 46 > length or directory[position:position + 4] != b"PK\x01\x02":
            raise ValueError("Malformed ZIP central directory.")
        name, extra, note, start_disk = struct.unpack_from("<4H", directory, position + 28)
        compressed, uncompressed = struct.unpack_from("<2I", directory, position + 20)
        local_offset = struct.unpack_from("<I", directory, position + 42)[0]
        if start_disk or 0xFFFFFFFF in (compressed, uncompressed, local_offset):
            raise ValueError("ZIP64 or multi-disk entries are not supported.")
        if local_offset >= offset:
            raise ValueError("ZIP entry points outside the file-data region.")
        position += 46 + name + extra + note
        count += 1
        if position > length or count > MAX_ENTRIES:
            raise ValueError("Malformed ZIP entry or entry-count budget exceeded.")
    if count != entries:
        raise ValueError("ZIP entry count does not match its central directory.")


def safe_parts(info):
    name = info.orig_filename
    path = name[:-1] if name.endswith("/") else name
    parts = path.split("/")
    if (not path or len(name) > 4096 or len(parts) > 128
            or "\\" in name or ":" in name or "\x00" in name
            or any(part in ("", ".", "..") for part in parts)):
        raise ValueError("Unsafe or oversized ZIP entry path.")
    return parts


def text(value, field, warnings, budget):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > MAX_TEXT_CHARS:
        if len(warnings) < 32:
            warnings.append(f"{field}: expected a string of at most {MAX_TEXT_CHARS} characters.")
        return None
    if len(value) > budget[0]:
        if len(warnings) < 32:
            warnings.append("The 128 KiB bundle text budget was reached; some declarations are unknown.")
        return None
    budget[0] -= len(value)
    return value


def check_binary_plist(data):
    """Reject inflated binary object/reference tables before plistlib allocates them."""
    if not data.startswith(b"bplist00"):
        return
    if len(data) < 40:
        raise ValueError("Truncated binary plist.")
    offset_size, ref_size, count, root, table = struct.unpack_from(">6xBBQQQ", data, len(data) - 32)
    if (offset_size not in (1, 2, 4, 8) or ref_size not in (1, 2, 4, 8)
            or not 0 < count <= MAX_PLIST_OBJECTS or root >= count
            or table < 8 or table + count * offset_size > len(data) - 32):
        raise ValueError("Invalid or oversized binary plist object table.")
    references = 0
    scalar_bytes = 0
    for index in range(count):
        offset = int.from_bytes(data[table + index * offset_size:table + (index + 1) * offset_size], "big")
        if not 8 <= offset < table:
            raise ValueError("Invalid binary plist object offset.")
        token = data[offset]
        family, size = token >> 4, token & 15
        if family == 1 and size > 4:
            raise ValueError("Oversized binary plist integer.")
        if family not in (4, 5, 6, 10, 13):
            continue
        start = offset + 1
        if size == 15:
            if start >= table or data[start] >> 4 != 1 or data[start] & 15 > 3:
                raise ValueError("Invalid binary plist object size.")
            width = 1 << (data[start] & 15)
            start += 1
            if start + width > table:
                raise ValueError("Truncated binary plist object size.")
            size = int.from_bytes(data[start:start + width], "big")
            start += width
        if family in (10, 13):
            refs = size * (2 if family == 13 else 1)
            references += refs
            length = refs * ref_size
            if references > 100_000:
                raise ValueError("Binary plist reference budget exceeded.")
        else:
            length = size * (2 if family == 6 else 1)
            scalar_bytes += length
            if scalar_bytes > MAX_PLIST_BYTES:
                raise ValueError("Binary plist scalar budget exceeded.")
        if start + length > table:
            raise ValueError("Binary plist object extends outside the object region.")


def bundle_metadata(archive, info, kind, remaining):
    path = info.filename.rsplit("/", 1)[0]
    status = {"path": info.filename, "status": "unavailable"}
    result = {
        "path": path, "kind": kind, "info_plist": status,
        "identifier": None, "name": None, "version": None, "build": None,
        "minimum_os": None, "url_schemes": [], "usage_descriptions": {},
        "executable": {"path": None, "encryption": "not_checked"},
        "signing": "not_verified", "entitlements": "not_checked",
    }
    if info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
        status["reason"] = "Info.plist is not a regular archived file."
        return result, 0
    if info.flag_bits & 1:
        status["reason"] = "Info.plist is ZIP-encrypted; it was not read."
        return result, 0
    if info.file_size > MAX_PLIST_BYTES or info.compress_size > MAX_PLIST_BYTES:
        status["reason"] = "Info.plist exceeds the 2 MiB metadata budget."
        return result, 0
    if info.file_size > remaining:
        status["reason"] = "The total 8 MiB plist metadata budget is exhausted."
        return result, 0
    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
        status["reason"] = "Unsupported plist compression; only stored/deflated metadata is read."
        return result, 0
    try:
        with archive.open(info) as source:
            data = source.read(min(MAX_PLIST_BYTES, remaining) + 1)
        if len(data) > MAX_PLIST_BYTES or len(data) > remaining:
            status["reason"] = "Decoded Info.plist exceeds the metadata budget."
            return result, min(len(data), remaining)
        check_binary_plist(data)
        metadata = plistlib.loads(data)
        if not isinstance(metadata, dict):
            raise ValueError("The plist root must be a dictionary.")
    except Exception as error:
        status.update(status="malformed", reason=f"Cannot decode Info.plist ({type(error).__name__}).")
        return result, info.file_size
    status["status"] = "parsed"
    warnings = []
    text_budget = [128 * 1024]
    for output, key in (("identifier", "CFBundleIdentifier"), ("version", "CFBundleShortVersionString"),
                        ("build", "CFBundleVersion"), ("minimum_os", "MinimumOSVersion")):
        result[output] = text(metadata.get(key), key, warnings, text_budget)
    result["name"] = text(metadata.get("CFBundleDisplayName", metadata.get("CFBundleName")), "bundle name", warnings, text_budget)
    executable = text(metadata.get("CFBundleExecutable"), "CFBundleExecutable", warnings, text_budget)
    if executable and executable not in (".", "..") and not any(char in executable for char in "/\\:\x00"):
        result["executable"]["path"] = f"{path}/{executable}"
    elif executable:
        warnings.append("CFBundleExecutable is not a safe single filename; no executable path was derived.")
    url_types = metadata.get("CFBundleURLTypes", [])
    malformed_url_types = not isinstance(url_types, list)
    if isinstance(url_types, list):
        seen_schemes = set()
        for url_type in url_types:
            schemes = url_type.get("CFBundleURLSchemes", []) if isinstance(url_type, dict) else None
            if isinstance(schemes, list):
                for scheme in schemes:
                    value = text(scheme, "CFBundleURLSchemes", warnings, text_budget)
                    if value is not None and value not in seen_schemes:
                        if len(seen_schemes) >= 256:
                            warnings.append("URL scheme inventory is partial: the 256 declaration budget was reached.")
                            break
                        result["url_schemes"].append(value)
                        seen_schemes.add(value)
            else:
                malformed_url_types = True
            if len(seen_schemes) >= 256:
                if len(warnings) < 32:
                    warnings.append("URL scheme inspection stops at 256 unique declarations.")
                break
    if malformed_url_types:
        warnings.append("URL scheme inventory is partial: a URL declaration has an invalid structure.")
    for key, value in metadata.items():
        if isinstance(key, str) and len(key) <= 256 and key.startswith("NS") and key.endswith("UsageDescription"):
            if len(result["usage_descriptions"]) >= 256:
                warnings.append("Usage-description inventory is partial: the 256 declaration budget was reached.")
                break
            result["usage_descriptions"][key] = text(value, key, warnings, text_budget)
    if warnings:
        status["warnings"] = warnings
    return result, len(data)


def inspect_ipa(path):
    path = Path(path).resolve(strict=True)
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("The IPA input must be a regular file.")
        check_zip_directory(stream, before.st_size)
        with zipfile.ZipFile(stream) as archive:
            infos = archive.infolist()
            seen = set()
            bundle_infos = []
            frameworks = set()
            framework_bytes = 0
            frameworks_complete = True
            for info in infos:
                parts = safe_parts(info)
                normalized = "/".join(parts)
                if normalized in seen:
                    raise ValueError("Duplicate ZIP entry path; IPA inventory would be ambiguous.")
                seen.add(normalized)
                if len(parts) >= 3 and parts[0] == "Payload" and parts[1].endswith(".app") and parts[-1] == "Info.plist":
                    kind = "application" if len(parts) == 3 else "extension" if parts[-2].endswith(".appex") else None
                    if kind:
                        bundle_infos.append((info, kind))
                        if len(bundle_infos) > MAX_BUNDLES:
                            raise ValueError("The 256 application/extension metadata budget is exceeded.")
                for index, part in enumerate(parts if info.is_dir() else parts[:-1]):
                    if part.endswith(".framework"):
                        framework = "/".join(parts[:index + 1])
                        if framework not in frameworks:
                            size = len(framework.encode("utf-8"))
                            if framework_bytes + size <= MAX_FRAMEWORK_PATH_BYTES:
                                frameworks.add(framework)
                                framework_bytes += size
                            else:
                                frameworks_complete = False
            if not any(kind == "application" for _, kind in bundle_infos):
                raise ValueError("IPA must contain Payload/<application>.app/Info.plist.")
            bundles = []
            remaining = MAX_TOTAL_PLIST_BYTES
            for info, kind in sorted(bundle_infos, key=lambda item: item[0].filename):
                bundle, consumed = bundle_metadata(archive, info, kind, remaining)
                bundles.append(bundle)
                remaining -= consumed
            archive_summary = {
                "entries": len(infos), "compressed_bytes": sum(info.compress_size for info in infos),
                "uncompressed_bytes": sum(info.file_size for info in infos),
            }
        digest = hashlib.sha256()
        stream.seek(0)
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
        after = os.fstat(stream.fileno())
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError("The input changed during inspection; no report was saved.")
    limitations = [
        "Static archive metadata only; no application code was executed, extracted or decompiled.",
        "Mach-O/FairPlay encryption was not checked. ZIP encryption flags describe archive members only.",
        "Code signatures and entitlements were not verified or decoded.",
        "Info.plist values are declarations, not observed permissions, runtime behavior or trusted identity.",
        "Framework paths are directory-layout observations, not proof that a library is linked or loaded.",
    ]
    if any(bundle["info_plist"]["status"] != "parsed" for bundle in bundles):
        limitations.append("Some bundle metadata is unavailable or malformed; missing values remain unknown.")
    if not frameworks_complete:
        limitations.append("Framework path inventory exceeds its 1 MiB budget and is partial.")
    return {
        "schema_version": 1, "platform": "ios", "analysis": "static-package",
        "input": {"path": str(path), "name": path.name, "size_bytes": before.st_size, "sha256": digest.hexdigest()},
        "archive": archive_summary, "bundles": bundles, "frameworks": sorted(frameworks),
        "frameworks_complete": frameworks_complete, "limitations": limitations,
    }


def escape_markdown(value):
    if value is None:
        return "Unknown"
    return "".join(f"&#{ord(char)};" if char in "&<>[]()\\`*_|#" or ord(char) < 32 or ord(char) == 127 else char for char in str(value))


def report_lines(evidence):
    yield "# AppUnpack: iOS static report\n"
    yield f"Input: {escape_markdown(evidence['input']['name'])}\n"
    yield f"SHA-256: {evidence['input']['sha256']}\n"
    yield f"Archive entries: {evidence['archive']['entries']}\n"
    for bundle in evidence["bundles"]:
        yield f"## {escape_markdown(bundle['path'])}\n"
        yield f"Plist status: {bundle['info_plist']['status']}\n"
        if "reason" in bundle["info_plist"]:
            yield f"Reason: {escape_markdown(bundle['info_plist']['reason'])}\n"
        for label, key in (("Identifier", "identifier"), ("Name", "name"), ("Version", "version"),
                           ("Build", "build"), ("Minimum OS", "minimum_os")):
            yield f"{label}: {escape_markdown(bundle[key])}\n"
        schemes = ", ".join(escape_markdown(value) for value in bundle["url_schemes"])
        complete = bundle["info_plist"]["status"] == "parsed" and not bundle["info_plist"].get("warnings")
        missing = "None declared in readable metadata" if complete else "Unknown"
        yield f"URL schemes: {schemes or missing}\n"
        for key, value in bundle["usage_descriptions"].items():
            yield f"{escape_markdown(key)}: {escape_markdown(value)}\n"
        for warning in bundle["info_plist"].get("warnings", []):
            yield f"Metadata warning: {escape_markdown(warning)}\n"
    yield "## Framework paths\n"
    yield "\n".join(escape_markdown(value) for value in evidence["frameworks"]) or "No framework paths observed."
    yield "\n\n## Limits\n"
    for limitation in evidence["limitations"]:
        yield f"- {escape_markdown(limitation)}\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=Path)
    parser.add_argument("--output", required=True, type=Path, help="New report directory; existing paths are never overwritten")
    args = parser.parse_args(argv)
    try:
        if os.path.lexists(args.output):
            raise ValueError("Output path already exists; choose a new directory.")
        evidence = inspect_ipa(args.ipa)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.mkdir()
        with (args.output / "evidence.json").open("x", encoding="utf-8") as target:
            json.dump(evidence, target, ensure_ascii=True, indent=2)
            target.write("\n")
        with (args.output / "report.md").open("x", encoding="utf-8") as target:
            target.writelines(report_lines(evidence))
        print(f"Report saved: {args.output.resolve()}")
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, UnicodeError) as error:
        print(f"appunpack ipa: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
