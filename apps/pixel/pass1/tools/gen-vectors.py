#!/usr/bin/env python3
"""Emits `Vectors.java` from the shared cross-implementation fixture.

The fixture is the single source of truth for both implementations
(`runtime/journal/tests/vectors.test.ts` reads the same file). Generating the
Java rather than transcribing it keeps it that way: a hand-copied fixture pins
the copy, not the agreement.
"""
import json
import sys

# Java processes \uXXXX escapes before it lexes the source, so a control
# character written that way would end the string literal -- or the line. The
# ones with short escapes are safe; anything else must not be emitted at all.
SHORT = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t",
         "\b": "\\b", "\f": "\\f"}


def literal(value: str) -> str:
    out = ['"']
    for ch in value:
        if ch in SHORT:
            out.append(SHORT[ch])
        elif ord(ch) < 0x20:
            raise SystemExit(
                f"vectors.json contains control character U+{ord(ch):04X}, which "
                "cannot be written as a Java literal; add a short escape for it "
                "in gen-vectors.py before using it in a vector")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def emit(value, body, counter):
    """Returns a Java expression for `value`, appending any statements needed."""
    if isinstance(value, dict):
        counter[0] += 1
        name = f"m{counter[0]}"
        body.append(f"        Map<String, Object> {name} = Json.obj();")
        for key, item in value.items():
            body.append(f"        {name}.put({literal(key)}, {emit(item, body, counter)});")
        return name
    if isinstance(value, list):
        counter[0] += 1
        name = f"l{counter[0]}"
        body.append(f"        List<Object> {name} = new ArrayList<>();")
        for item in value:
            body.append(f"        {name}.add({emit(item, body, counter)});")
        return name
    if isinstance(value, bool):
        return "Boolean.TRUE" if value else "Boolean.FALSE"
    if value is None:
        return "null"
    if isinstance(value, int):
        return f"Long.valueOf({value}L)"
    if isinstance(value, float):
        raise SystemExit("vectors.json contains a float; the encoder takes integers only")
    if isinstance(value, str):
        return literal(value)
    raise SystemExit(f"unsupported value in vectors.json: {type(value).__name__}")


def method(name, value):
    body, counter = [], [0]
    root = emit(value, body, counter)
    lines = [f"    static Map<String, Object> {name}() {{", *body, f"        return {root};", "    }"]
    return "\n".join(lines)


def main() -> None:
    path, package = sys.argv[1], sys.argv[2]
    with open(path, encoding="utf-8") as handle:
        vectors = json.load(handle)

    print(f"package {package};")
    print()
    print("import java.util.ArrayList;")
    print("import java.util.List;")
    print("import java.util.Map;")
    print()
    print(f"/** Generated from {path} by tools/gen-vectors.py. Do not edit. */")
    print("final class Vectors {")
    print("    private Vectors() {}")
    print()
    print(f"    static final String PAYLOAD_CANONICAL = {literal(vectors['payloadCanonical'])};")
    print(f"    static final String PAYLOAD_HASH = {literal(vectors['payloadHash'])};")
    print(f"    static final String HASH = {literal(vectors['hash'])};")
    print()
    print(method("payload", vectors["payload"]))
    print()
    print(method("preimageInput", vectors["preimageInput"]))
    print("}")


if __name__ == "__main__":
    main()
