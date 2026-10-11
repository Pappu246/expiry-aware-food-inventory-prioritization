# VGU A-6 Rubric Alignment

**Project:** Expiry-Aware Food Inventory Prioritization Engine Using Data Structures  
**Source:** VGU notice, “Rubrics / Guidelines of A6 Project Component,” dated 04 February 2026. The report follows the notice's deliverables; the user confirmed no separate template or fixed formatting rule was prescribed.

## Weightage from the notice

- **Project work and outcomes: 60%** — innovation/idea (15%), methodology (10%), applications and scope (15%), results and outcomes validation (20%).
- **Project report: 25%** — introduction/literature review (5%), methodology (5%), results analysis (5%), applications and scope (5%), references and citations (5%).
- **Project presentation: 15%** — problem statement and significance (5%), clarity of project with applications (5%), communication skills (5%).

## Evidence included

- **Front matter:** cover page, declaration, acknowledgement, abstract and contents.
- **Literature/research gap:** focused cited background from the algorithms text and FSSAI/FAO context with an explicit, bounded project-level gap; not described as a systematic literature review.
- **Implementation:** C11 custom Min-Heap, open-addressing hash table, linear FEFO baseline, and a separate FIFO policy experiment. FIFO is accurately documented as an arrival-ordered array baseline whose exhausted-front removal and expiry filtering may be O(n).
- **One project across semester courses:** course-wise relevance is stated for Data Structures, Data Science Architecture, Data Analysis with Python (downstream CSV use only) and Discrete Mathematics. No additional apps or Python runtime are claimed.
- **Differential evidence:** 12 seeds × 64 batches; heap/linear selection choices matched. Five benchmark sizes each matched 200/200 selected IDs.
- **Experiment data:** 180 raw FEFO/FIFO rows and 18 summary groups from ten seeds, three sizes and three target demand/supply ratios. CSV outputs are tracked in this repository.
- **Runnable source:** C11 source/build/test scripts are in the root project; use the README's build instructions.

## Limits

Timing and simulated stock outcomes are specific to the documented synthetic workload. The program does not assess physical food safety or establish real-world food-waste savings. Local package test results and GitHub Actions results must be distinguished; do not claim a CI run that has not completed.
