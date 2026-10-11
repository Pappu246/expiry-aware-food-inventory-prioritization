#!/usr/bin/env python3
"""Black-box smoke tests for the practical local inventory application."""
from __future__ import annotations
import csv
import datetime as dt
import pathlib
import subprocess
import tempfile
import sys


def run_app(executable: pathlib.Path, cwd: pathlib.Path, input_text: str) -> str:
    result = subprocess.run(
        [str(executable)], cwd=cwd, input=input_text, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20,
    )
    if result.returncode != 0:
        raise AssertionError(f"app exit={result.returncode}\n{result.stdout[-4000:]}")
    if "ERROR:" in result.stdout:
        raise AssertionError(result.stdout[-4000:])
    return result.stdout


def read_inventory(path: pathlib.Path) -> dict[str, dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as file:
        return {row["batch_id"]: row for row in csv.DictReader(file)}


def main() -> int:
    exe = pathlib.Path(sys.argv[1]).resolve()
    today = dt.date.today()
    expiry = (today + dt.timedelta(days=10)).isoformat()
    today_s = today.isoformat()
    with tempfile.TemporaryDirectory(prefix="a6-inventory-smoke-") as temp:
        root = pathlib.Path(temp)
        # Receive two different product types; issuing Rice must never consume Beans.
        user_input = "\n".join([
            "1", "BATCH-R1", "Rice", "5", "", expiry,
            "1", "BATCH-B1", "Beans", "7", "", expiry,
            "4", "Rice", "1", "6",
            "7", "0", "",
        ])
        output = run_app(exe, root, user_input)
        expected = "Requested: 6 | Fulfilled: 5 | Shortfall: 1"
        if expected not in output:
            raise AssertionError(f"shortfall behavior not observed\n{output[-5000:]}")
        if "BATCH-R1" not in output or "BATCH-B1" not in output:
            raise AssertionError("inventory entry/view output missing batch IDs")
        rows = read_inventory(root / "data" / "inventory.csv")
        if rows["BATCH-R1"]["quantity"] != "0" or rows["BATCH-R1"]["status"] != "EXHAUSTED":
            raise AssertionError(f"Rice batch did not exhaust correctly: {rows['BATCH-R1']}")
        if rows["BATCH-B1"]["quantity"] != "7" or rows["BATCH-B1"]["status"] != "ACTIVE":
            raise AssertionError(f"different product was incorrectly changed: {rows['BATCH-B1']}")
        # Reopen confirms persisted stock survives process exit.
        reopen = run_app(exe, root, "2\n0\n")
        if "BATCH-B1" not in reopen or "Beans" not in reopen:
            raise AssertionError("inventory did not persist after restart")
        if not (root / "data" / "transactions.csv").exists():
            raise AssertionError("transaction log was not created")
        if not (root / "data" / "stock_report.csv").exists():
            raise AssertionError("stock report export was not created")
        print("PASS: actual stock entry, per-item isolation, FEFO issue, shortfall, persistence, transaction log and CSV export")

    with tempfile.TemporaryDirectory(prefix="a6-inventory-sample-") as temp:
        root = pathlib.Path(temp)
        # Sample stock must allocate the earliest expiry first and remain stored on exit.
        output = run_app(exe, root, "D\n4\nRice\n1\n25\n0\n")
        if "Policy: FEFO_MIN_HEAP" not in output or "Fulfilled: 25 | Shortfall: 0" not in output:
            raise AssertionError(f"FEFO example failed\n{output[-5000:]}")
        rows = read_inventory(root / "data" / "inventory.csv")
        if rows["DEMO-RICE-001"]["quantity"] != "0" or rows["DEMO-RICE-002"]["quantity"] != "7":
            raise AssertionError("FEFO did not use the earlier-expiring Rice batch first")
        print("PASS: sample dataset and earliest-expiry-first allocation order")

    with tempfile.TemporaryDirectory(prefix="a6-inventory-import-") as temp:
        root = pathlib.Path(temp)
        today = dt.date.today()
        expiry = (today + dt.timedelta(days=5)).isoformat()
        csv_path = root / "initial_stock.csv"
        csv_path.write_text(
            "batch_id,item,quantity,received_date,expiry_date\n"
            f'IMP-1,"Rice, Premium",4,{today.isoformat()},{expiry}\n'
            f'IMP-2,Beans,3,{today.isoformat()},{expiry}\n'
            f'IMP-OLD,Expired Item,8,{today.isoformat()},{(today - dt.timedelta(days=1)).isoformat()}\n',
            encoding="utf-8",
        )
        output = run_app(exe, root, f"9\n{csv_path}\n2\n0\n")
        if "2 added, 1 skipped" not in output:
            raise AssertionError(f"CSV import validation result was unexpected\n{output[-5000:]}")
        rows = read_inventory(root / "data" / "inventory.csv")
        if rows.get("IMP-1", {}).get("item") != "Rice, Premium" or "IMP-OLD" in rows:
            raise AssertionError("quoted CSV item or expired-row rejection failed")
        print("PASS: CSV bulk import, quoted item names, and expired-row rejection")

    with tempfile.TemporaryDirectory(prefix="a6-inventory-expiry-") as temp:
        root = pathlib.Path(temp)
        yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
        today_s = dt.date.today().isoformat()
        (root / "data").mkdir()
        (root / "data" / "inventory.csv").write_text(
            "batch_id,item,quantity,received_date,expiry_date,status\n"
            f"OLD-1,Rice,6,{yesterday},{yesterday},ACTIVE\n"
            f"TODAY-1,Beans,3,{today_s},{today_s},ACTIVE\n",
            encoding="utf-8",
        )
        output = run_app(exe, root, "0\n")
        rows = read_inventory(root / "data" / "inventory.csv")
        if rows["OLD-1"]["status"] != "EXPIRED" or rows["TODAY-1"]["status"] != "ACTIVE":
            raise AssertionError("expiry boundary/status transition did not match the declared rule")
        if "EXPIRE" not in (root / "data" / "transactions.csv").read_text(encoding="utf-8"):
            raise AssertionError("expiry status change was not written to transaction history")
        print("PASS: date-based expiry transition and expiry-day eligibility boundary")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
