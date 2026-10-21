"""Measure RFC 9106's memory-constrained profile and stronger bounded variants."""

import json
import os
import platform
import secrets
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from importlib.metadata import version
from argon2 import PasswordHasher
from argon2.low_level import Type


def main():
    results = []
    for memory, iterations in [(65536, 3), (65536, 4), (131072, 3)]:
        hasher = PasswordHasher(
            memory_cost=memory,
            time_cost=iterations,
            parallelism=4,
            salt_len=16,
            hash_len=32,
            type=Type.ID,
        )
        password = secrets.token_urlsafe(32)
        stored = hasher.hash(password)

        def trial(_):
            started = time.perf_counter()
            hasher.verify(stored, password)
            return (time.perf_counter() - started) * 1000

        samples = [trial(i) for i in range(7)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            concurrent = list(pool.map(trial, range(8)))
        results.append(
            {
                "memory_kib": memory,
                "time_cost": iterations,
                "parallelism": 4,
                "salt_bytes": 16,
                "hash_bytes": 32,
                "median_ms": round(statistics.median(samples), 2),
                "max_ms": round(max(samples), 2),
                "two_concurrent_median_ms": round(statistics.median(concurrent), 2),
                "samples_ms": samples,
            }
        )
    print(
        json.dumps(
            {
                "host": platform.platform(),
                "cpu_count": os.cpu_count(),
                "argon2_cffi": version("argon2-cffi"),
                "selected": {"memory_kib": 65536, "time_cost": 3, "parallelism": 4},
                "rationale": "RFC 9106 SECOND RECOMMENDED: 64 MiB per hash, two concurrent hashes per process (128 MiB working memory budget). Rebenchmark on the deployment Pi; this is the development host.",
                "results": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
