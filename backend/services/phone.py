"""Phone number normalization and validation."""

import re

US_E164_PATTERN = re.compile(r"^\+1\d{10}$")
MX_E164_PATTERN = re.compile(r"^\+52\d{10}$")
LOCAL_10_PATTERN = re.compile(r"^\d{10}$")


def normalize_phone(phone: str) -> str:
    raw = (phone or "").strip()
    if not raw:
        return ""

    if raw.startswith("00"):
        raw = f"+{raw[2:]}"

    if raw.startswith("+"):
        digits = re.sub(r"\D", "", raw[1:])
        return f"+{digits}" if digits else ""

    digits_only = re.sub(r"\D", "", raw)
    if digits_only.startswith("1") and len(digits_only) == 11:
        return f"+{digits_only}"
    if digits_only.startswith("52") and len(digits_only) == 12:
        return f"+{digits_only}"
    return digits_only


def is_valid_phone(phone: str) -> bool:
    return bool(
        US_E164_PATTERN.match(phone)
        or MX_E164_PATTERN.match(phone)
        or LOCAL_10_PATTERN.match(phone)
    )


def phones_match(input_phone: str, registered_phone: str) -> bool:
    if input_phone == registered_phone:
        return True

    input_digits = re.sub(r"\D", "", input_phone)[-10:]
    registered_digits = re.sub(r"\D", "", registered_phone)[-10:]
    return bool(input_digits and registered_digits and input_digits == registered_digits)
