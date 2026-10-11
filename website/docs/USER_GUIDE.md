# FreshTrack Practical User Guide

## First use

1. Double-click `START_WEBSITE.bat` and leave the server terminal open.
2. Open `http://127.0.0.1:4173`.
3. Select **Try demo data** to understand the interface, or immediately select **Add batch** to use your real records. Demo values are fictional.
4. Back up the data from **Settings & backup** or **Reports** before major imports/restores.

## Add actual stock

For each received batch, enter its own unique batch code, item name, category, quantity, unit, received date and expiry date. Add supplier and cost per unit when known. Different units (for example kg and bags) are never combined for stock issue, even when the item name is the same.

If the same product arrives on different dates or has different expiry dates, record separate batches. Do not merge batches if that would hide their different expiry dates.

## Issue stock

1. Open **Issue stock**.
2. Select an item/unit, enter the quantity and issue date.
3. Select FEFO or FIFO. FEFO is recommended when expiry dates matter.
4. Optionally add a department/reference and note.
5. Select **Calculate & issue stock**.

The application deducts stock batch by batch and writes one movement for each allocated batch. If eligible unexpired stock is insufficient, it issues the available amount and clearly reports the unfulfilled shortfall. Expired batches are excluded.

## Receive, correct or remove stock

Open **Inventory**, find the correct batch and choose **Adjust**. Use Receive for extra units, Remove for a correction or other removal, and Expired write-off for expired stock. The write-off action is permitted only after the expiry date. Enter a reason where possible.

A batch with zero remaining units can be archived. Archiving hides it from active inventory but leaves its movement history available.

## Import real data from CSV

Use **Inventory → Import CSV**. Start with the downloadable template in **Settings & backup** so column names and date format are correct. Validate stock labels before import. Existing batch codes are not silently overwritten. Review the import result, correct skipped rows and re-import those rows.

## Review reports and back up

- **Reports → Inventory report (CSV):** current active batches and their remaining quantities.
- **Reports → Movement log (CSV):** receipts, stock issues, adjustments and write-offs.
- **Reports → Complete backup (JSON):** active/archived records, movement history and settings.
- **Settings & backup → Restore:** restores from a FreshTrack JSON backup after replacing current data. Export a backup first.

## Limits to remember

This package is designed for a local academic/practical demonstration and a single local workstation. The file-based backend is not a replacement for a transactional database when several users work at once. There is no account system or remote access. Don't place sensitive or safety-critical operations on a public server without a security review, authentication, managed storage and tested backups.