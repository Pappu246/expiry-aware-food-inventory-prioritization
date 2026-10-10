# Live Demonstration Guide (Windows + VS Code)

Project: **Expiry-Aware Food Inventory Prioritization Engine Using Data Structures**  
Language: C11 • Interface: command-line prototype • Data: reproducible synthetic workloads

## What to show the faculty

Use **VS Code + its integrated PowerShell terminal**. The approved project scope is a C11 command-line prototype; a website is not part of this project's requirements, so do not present it as a website or spend time building a web UI.

### Before the presentation

1. Install VS Code and a C compiler (GCC via MSYS2/MinGW-w64, or Clang).
2. Open the repository folder `expiry-aware-food-inventory-prioritization` in VS Code.
3. In Terminal → New Terminal, confirm that the prompt is at the repository root.
4. Run `.` followed by `\demo.ps1 -Quick` (see the exact command below). If PowerShell blocks scripts, use the command only in a terminal for this project and follow your institution's device policy; do not change system-wide execution policy just for the demo.

Exact command:

```powershell
.\demo.ps1 -Quick
```

The quick run compiles the app, runs the 13 normal test groups, runs the separate 14-group allocation-failure-injection build, shows the FEFO demo, and replays a 100-batch synthetic scenario. It normally fits a short class demonstration.

For the complete evidence generation run:

```powershell
.\demo.ps1
```

It additionally writes the 180-row FEFO-vs-FIFO policy matrix, five-size seven-trial structure benchmark, and separate operation-count CSV. This may take longer than the quick run.

## Suggested 3–5 minute talk track

1. **Problem:** batches may arrive in one order and expire in another; FIFO and FEFO are not interchangeable.
2. **Core data structure:** open `src/engine.c` and `include/fefo/engine.h`; show the comparator, heap insert/extract and the batch model.
3. **Live selection:** run `.`\build\fefo.exe demo`. Explain why the earliest-expiring eligible batch is chosen, how partial allocation works, and how a shortfall is reported.
4. **Policy comparison:** run `.`\build\fefo.exe simulate 100`. Explain that the same generated arrivals/demand are replayed against heap FEFO, linear FEFO and FIFO; outputs are synthetic.
5. **Evidence:** open `results/generated/policy_simulation.csv`. For the full run, also show `policy_experiment_summary.csv`, `structure_benchmark_summary.csv` and `structure_operation_counts.csv`.
6. **Correctness and limits:** state that CI passed 13/13 regular test groups, 14/14 allocation-failure-build groups, ASan/UBSan and the benchmark smoke tests. Timing is specific to the CI runner/workload; the program does not assess physical food safety or prove real-world food-waste savings.

## If the teacher asks “Why no website?”

“This project was scoped as a dependency-free C11 command-line Data Structures prototype. Its purpose is to demonstrate the Min-Heap, hash table, a linear FEFO correctness baseline, the FIFO policy experiment and measured CSV evidence. A web UI would add scope without strengthening the central algorithm comparison.”

## If a command fails

- **GCC/Clang not found:** install a C11 compiler and restart VS Code so its PATH is refreshed.
- **PowerShell scripts disabled:** use an approved terminal/policy for a local project; do not weaken machine-wide security settings.
- **Cannot clone a private repository:** use GitHub's repository Code → Download ZIP while signed in as the repository owner/collaborator, extract it, and open the extracted folder in VS Code.
- **No internet in class:** run `.`\demo.ps1 -Quick` before the viva to validate the local environment. Bring this guide and the completed report/slide PDFs. The app's core build/demo/tests do not need an API key or external runtime service.

## Expected output files

- `results/generated/policy_simulation.csv` — quick/full smoke scenario.
- `results/generated/policy_experiment_raw.csv` and `policy_experiment_summary.csv` — 180 raw policy rows and 18 summary groups.
- `results/generated/structure_benchmark.csv` and `structure_benchmark_summary.csv` — five sizes with seven timing trials and summaries.
- `results/generated/structure_operation_counts.csv` — instrumentation collected separately from timing.

Every result is based on a synthetic workload. Do not claim the output certifies food safety or shows measured savings in a real canteen.
