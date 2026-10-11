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
        # Final no-op save on exit must not overwrite the useful pre-issue backup.
        backup = read_inventory(root / "data" / "inventory_backup.csv")
        if backup.get("BATCH-R1", {}).get("quantity") != "5" or backup.get("BATCH-R1", {}).get("status") != "ACTIVE":
            raise AssertionError(f"unchanged exit save overwrote the previous-state backup: {backup.get('BATCH-R1')}")
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
            f'IMP-OLD,Expired Item,8,{today.isoformat()},{(today - dt.timedelta(days=1)).isoformat()}\n'
            f'IMP-SIGNED-MONTH,Malformed,1,{today.isoformat()},{today.year + 1:04d}-+1-02\n'
            f'IMP-SIGNED-DAY,Malformed,1,{today.isoformat()},{today.year + 1:04d}-01-+2\n'
            f'IMP-FUTURE-RECEIPT,Future Receipt,1,{today.year + 1:04d}-01-01,{today.year + 1:04d}-01-05\n',
            encoding="utf-8",
        )
        output = run_app(exe, root, f"9\n{csv_path}\n2\n0\n")
        if "2 added, 4 skipped" not in output:
            raise AssertionError(f"CSV import validation result was unexpected\n{output[-5000:]}")
        rows = read_inventory(root / "data" / "inventory.csv")
        if (rows.get("IMP-1", {}).get("item") != "Rice, Premium" or
                any(key in rows for key in ("IMP-OLD", "IMP-SIGNED-MONTH", "IMP-SIGNED-DAY", "IMP-FUTURE-RECEIPT"))):
            raise AssertionError("quoted CSV item or invalid/expired-date rejection failed")
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

    with tempfile.TemporaryDirectory(prefix="a6-inventory-corrupt-load-") as temp:
        root = pathlib.Path(temp)
        data_dir = root / "data"
        data_dir.mkdir()
        today = dt.date.today()
        expiry = (today + dt.timedelta(days=15)).isoformat()
        inventory_path = data_dir / "inventory.csv"
        backup_path = data_dir / "inventory_backup.csv"
        original_inventory = (
            "batch_id,item,quantity,received_date,expiry_date,status\n"
            f"VALID-1,Rice,2,{today.isoformat()},{expiry},ACTIVE\n"
            f"BROKEN-1,Beans,not-a-number,{today.isoformat()},{expiry},ACTIVE\n"
        ).encode("utf-8")
        known_good_backup = (
            "batch_id,item,quantity,received_date,expiry_date,status\n"
            f"BACKUP-1,Oats,9,{today.isoformat()},{expiry},ACTIVE\n"
        ).encode("utf-8")
        inventory_path.write_bytes(original_inventory)
        backup_path.write_bytes(known_good_backup)
        proc = subprocess.run(
            [str(exe)], cwd=root, input="0\n", text=True,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20,
        )
        if proc.returncode == 0:
            raise AssertionError("app should fail closed when it cannot load the entire saved inventory")
        if "refusing to load partial stock" not in proc.stdout or "stopped without rewriting" not in proc.stdout:
            raise AssertionError(f"corrupt inventory recovery warning was missing\n{proc.stdout[-3000:]}")
        if inventory_path.read_bytes() != original_inventory:
            raise AssertionError("app rewrote the original malformed inventory instead of preserving it")
        if backup_path.read_bytes() != known_good_backup:
            raise AssertionError("app overwrote the known-good previous inventory backup")
        print("PASS: malformed inventory fails closed without overwriting current or backup data")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
