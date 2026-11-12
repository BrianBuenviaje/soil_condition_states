# Soil condition states from low cost IoT sensor data

Code and data for the undergraduate thesis *Unsupervised Identification of Soil
Condition States from Low Cost IoT Sensor Data with Random Forest Classification
and a Threshold Based Expert System* (Ateneo de Davao University, School of Arts
and Sciences, Computer Studies Division).

The pipeline identifies recurring soil condition states from moisture, pH and
temperature readings of five sensor nodes, without laboratory labels; validates
them by leaving one node out; trains a Random Forest to assign new readings to a
state; compares it against standard baselines; and tests whether forecasting can
beat a "no change" baseline.

## User application

The `monitor` folder holds the Soil Condition Monitor, a minimal application designed for smartphones that shows each node's state, its past week, and the recommendation of the rule base (Appendix B of the thesis). Open `monitor/app/index.html` in any browser; it needs no installation and works offline. See `monitor/README.md`.

## Requirements

* Python 3.11 or later (results were produced with 3.13.16)
* About 1 GB of free memory. No GPU is needed.
* The library versions pinned in `requirements.txt`. All of them are needed by
  the pipeline except `statsmodels`, which only step 18 uses, to check the
  statistical tests of step 7 against a second implementation. `pillow` is
  installed with `matplotlib` in any case; the figure steps use it to write the
  images without an alpha channel, which keeps the LaTeX build fast.

## Install

```bash
git clone https://github.com/BrianBuenviaje/soil_condition_states.git
cd soil_condition_states
python -m venv .venv
# Windows:        .venv\Scripts\activate
# macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Minimal working example (about 5 seconds)

```bash
python minimal_example.py
```

It reads the workbook in `data/`, builds the features, identifies the four states
on the training period (13 October to 5 November 2025), trains the Random Forest
with its tuned settings and scores it on the test week (6 to 13 November).
With the pinned versions you should see:

```
3029 readings from 5 nodes
train 2234 readings, test 795 readings
accuracy 0.9308   balanced accuracy 0.9697   macro F1 0.9622
```

## Reproduce every result in the thesis (about 30 minutes)

```bash
python run_all.py
```

This runs every step below in order and writes the complete console output to
`pipeline_run_log.txt`, and the duration of each step to `pipeline_step_times.csv`.
Compare the log with the reference copy; apart from the timestamp and the timing
lines they should be identical:

```bash
# macOS or Linux
diff <(grep -v -e "^Run at" -e "completed in" pipeline_run_log.txt) \
     <(grep -v -e "^Run at" -e "completed in" reference/pipeline_run_log.txt)
# Windows (PowerShell)
Compare-Object (Get-Content pipeline_run_log.txt | Select-String -NotMatch "Run at|completed in") `
               (Get-Content reference\pipeline_run_log.txt | Select-String -NotMatch "Run at|completed in")
```

| Step | Script | What it produces |
|---|---|---|
| 0 | `extract_data.py` | `soil_clean.csv`: the 3,030 usable readings from the workbook |
| 1 | `cluster_test.py` | whether clustering the raw readings just recovers the sensor locations (`raw_cluster_scan.csv`) |
| 2 | `features.py` | `soil_features.csv`: per node normalised features and moisture change |
| 3 | `pick_k.py` | state profiles for k = 3 to 6 |
| 4 | `lono.py 0 4` | the four states and the leave one node out transfer test |
| 5 | `tune_models.py` | grid search on the validation window; `best_configs.json` |
| 6 | `classifier_transitions.py` | Random Forest results and state transitions |
| 7 | `compare_models.py` | baselines, McNemar and Friedman tests, clustering comparison |
| 8 | `forecast_test.py` | tuned forecasting against the persistence baseline |
| 9 | `npk_table.py` | evidence that the nutrient channels derive from conductivity |
| 10 | `eda_numbers.py` | every number in the exploratory data analysis |
| 11 | `charts.py` | `fig1_clusters_vs_nodes.png` and `fig2_what_changes_over_time.png` (Figures 3 and 4 of the thesis) |
| 12 | `chart_lono.py` | `fig3_leave_one_node_out.png`, a supplementary view of the transfer test |
| 13 | `chapter4_analysis.py` | every further number in Chapter 4: number of states, state profiles, tuning curves, loss curves, learning curve, error analysis, baseline check, rule conditions (`ch4_numbers.json`) |
| 14 | `chapter4_robustness.py` | thirty repeated runs of the whole pipeline, the comparative matrix, the paired Wilcoxon tests and the fit and assignment times (`ch4_seeds.csv`, `ch4_runs_matrix.csv`, `ch4_wilcoxon.csv`, `ch4_timing.csv`) |
| 15 | `feature_analysis.py` | importance of each input, and what happens when one is withheld from the classifier and from the clustering (`ch4_importance.csv`, `ch4_ablation_*.csv`) |
| 16 | `scaling.py` | cost against the number of readings, nodes and states, and the estimated cost of a refit at deployment sizes (`ch4_scaling_*.csv`, `ch4_viability.csv`) |
| 17 | `solution_quality.py` | the clustering objective against the best known value and against the relaxation lower bound, for restart budgets from one to one hundred (`ch4_quality_*.csv`) |
| 18 | `verify_baselines.py` | fifteen independent checks of the baselines, the metrics, the statistical tests and the bound (`ch4_verification.csv`) |
| 19 | `validation_tests.py` | stability of each state under resampling, prediction strength on each withheld node, and the run length comparison against surrogate records (`validation_stability.csv`, `validation_prediction_strength.csv`, `validation_persistence.csv`, `validation_tests.json`) |
| 20 | `chapter4_figures.py` | `fig4_1` to `fig4_8`, Figures 5 to 12 of the thesis |
| 21 | `chapter4_figures_m4.py` | `fig4_9` to `fig4_15`, Figures 13 to 19 of the thesis |
| 22 | `write_ch4.py` | `results_and_discussion.tex`, Chapter 4 with every number filled in from the outputs above |
| 23 | `cluster_methods.py` | k means against k medoids, Ward, a Gaussian mixture, HDBSCAN and a Gaussian hidden Markov model on the same features (`comparison_methods.csv`, `comparison_methods.json`) |
| 24 | `cluster_methods_figure.py` | `ch4_methods.png`, Figure 11 of the thesis |

`sensitivity_range.py` is run separately, after `run_all.py`; it compares the states
under three cleaning rules for out of range readings (Appendix A of the thesis).

## Reproducibility

* Every random procedure uses a fixed seed (`random_state=0`).
* The test week is never read during tuning. Tuning uses 13 to 29 October for
  fitting and 30 October to 5 November for validation.
* Outputs that pass through parallel prediction are rounded to six decimal
  places, because thread order changes the last few digits between runs.
* The reference log was produced on Ubuntu 24.04 with the versions above. On a
  different processor or operating system a few values may differ in the last
  printed digit because of floating point arithmetic; no conclusion changes.

## Data

`data/One_Month_Calibrated_Data.xlsx` holds one month of hourly readings from five
nodes at a demonstration site in Davao City, Philippines, with the calibration
formulas applied in columns M to T. The data belong to the joint thesis project.
Ask the authors before reusing them.
