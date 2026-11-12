import subprocess, sys, time, platform, hashlib, os
import pandas as pd

XLSX = sys.argv[1] if len(sys.argv) > 1 else 'data/One_Month_Calibrated_Data.xlsx'
LOG  = 'pipeline_run_log.txt'

STEPS = [
    ('0. Extract the usable readings from the workbook',      ['extract_data.py', XLSX]),
    ('1. Clustering of the raw readings against the sensor locations', ['cluster_test.py']),
    ('2. Build the location free features',                    ['features.py']),
    ('3. How many states?',                                    ['pick_k.py']),
    ('4. Leave one node out transfer test (k = 4, seed 0)',    ['lono.py', '0', '4']),
    ('5. Hyperparameter tuning on the validation window',      ['tune_models.py']),
    ('6. Classifier and state transitions',                    ['classifier_transitions.py']),
    ('7. Baseline comparison and statistical tests',           ['compare_models.py']),
    ('8. Forecasting against the no change baseline',          ['forecast_test.py']),
    ('9. Nutrient channels versus conductivity',               ['npk_table.py']),
    ('10. Exploratory data analysis for Chapter 3',            ['eda_numbers.py']),
    ('11. Chapter 3 figures (thesis Figures 3 and 4)',                                   ['charts.py']),
    ('12. Supplementary transfer figure',                                         ['chart_lono.py']),
    ('13. Chapter 4 analysis',                                 ['chapter4_analysis.py']),
    ('14. Thirty independent runs, Wilcoxon tests and execution times', ['chapter4_robustness.py']),
    ('15. Importance of each input and the effect of removing it', ['feature_analysis.py']),
    ('16. Scaling and the limits of the approach',             ['scaling.py']),
    ('17. Solution quality and the optimality gap',            ['solution_quality.py']),
    ('18. Independent verification of the baselines, the tests and the bound', ['verify_baselines.py']),
    ('19. Stability, recognisability and the red noise comparison', ['validation_tests.py']),
    ('20. Chapter 4 figures (thesis Figures 5 to 12)',         ['chapter4_figures.py']),
    ('21. Chapter 4 figures (thesis Figures 13 to 19)',        ['chapter4_figures_m4.py']),
    ('22. Chapter 4 text, every number filled from the outputs', ['write_ch4.py', 'results_and_discussion.tex']),
    ('23. Comparison with five other clustering methods',     ['cluster_methods.py']),
    ('24. Clustering comparison figure (thesis Figure 11)',    ['cluster_methods_figure.py']),
]

def sha(path):
    try:
        return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]
    except OSError:
        return 'not found'

out = []
def w(s=''):
    print(s)
    out.append(s)

w('=' * 78)
w('SOIL CONDITION STATE ANALYSIS: FULL PIPELINE RUN')
w('=' * 78)
w(f'Run at        : {time.strftime("%Y-%m-%d %H:%M:%S %Z")}')
w(f'Python        : {platform.python_version()} on {platform.system()}')
for mod in ['pandas', 'numpy', 'sklearn', 'scipy', 'matplotlib']:
    try:
        w(f'{mod:<14}: {__import__(mod).__version__}')
    except Exception as e:
        w(f'{mod:<14}: not importable ({e})')
w(f'Input file    : {XLSX}')
w(f'Input sha256  : {sha(XLSX)} (first 16 hex)')
w()
w('Every script below fixes its random seed. Two runs of this file on the same')
w('workbook must agree line for line except for the timestamp above.')
w()

failed = []
step_times = []
for title, cmd in STEPS:
    w()
    w('-' * 78)
    w(title)
    w('-' * 78)
    w(f'$ python3 {" ".join(cmd)}')
    w()
    t0 = time.time()
    r = subprocess.run([sys.executable] + cmd, capture_output=True, text=True)
    for line in r.stdout.rstrip('\n').split('\n'):
        w(line)
    if r.returncode != 0:
        failed.append(title)
        w()
        w('*** THIS STEP FAILED ***')
        for line in r.stderr.rstrip('\n').split('\n')[-25:]:
            w('    ' + line)
    w()
    step_times.append(dict(step=title, seconds=round(time.time() - t0, 1)))
    pd.DataFrame(step_times).to_csv('pipeline_step_times.csv', index=False)
    w(f'[completed in {time.time()-t0:.1f} s]')

w()
w('=' * 78)
w('OUTPUT FILES')
w('=' * 78)
for f in sorted(['soil_clean.csv', 'soil_features.csv', 'soil_states_k4.csv', 'raw_cluster_scan.csv',
                 'lono_summary_seed0_k4.csv', 'forecast_results.csv', 'forecast_tuning.csv',
                 'forecast_lono.csv', 'best_configs.json', 'tuning_random_forest.csv',
                 'tuning_decision_tree.csv', 'tuning_logistic_regression.csv',
                 'comparison_chronological.csv', 'comparison_lono_folds.csv',
                 'comparison_clustering.csv', 'comparison_tests.json',
                 'npk_ec_evidence.csv', 'table_npk_ec.tex',
                 'fig1_clusters_vs_nodes.png', 'fig2_what_changes_over_time.png',
                 'fig3_leave_one_node_out.png', 'lono_shares_seed0_k4.csv',
                 'transition_counts.csv', 'transition_probabilities.csv', 'transitions_summary.json',
                 'ch4_numbers.json', 'ch4_k_selection.csv', 'ch4_state_profiles.csv',
                 'ch4_loss_curve.csv', 'ch4_learning_curve.csv', 'ch4_confusion_lr.csv',
                 'fig4_1_states_time.png', 'fig4_2_transfer.png', 'fig4_3_tuning_curves.png',
                 'fig4_4_loss_curves.png', 'fig4_5_confusion.png', 'fig4_6_lono_boxplot.png',
                 'fig4_7_forecast.png', 'fig4_8_seeds.png', 'ch4_seeds.csv', 'ch4_timing.csv',
                 'ch4_verification.csv', 'ch4_robustness.json', 'pipeline_step_times.csv',
                 'forecast_rows_moist6.csv', 'ch4_runs_matrix.csv', 'ch4_wilcoxon.csv',
                 'ch4_importance.csv', 'ch4_lr_coefficients.csv', 'ch4_ablation_classifier.csv',
                 'ch4_ablation_clustering.csv', 'ch4_feature_summary.json',
                 'ch4_scaling_readings.csv', 'ch4_scaling_nodes.csv', 'ch4_scaling_states.csv',
                 'ch4_scaling_length.csv', 'ch4_viability.csv', 'ch4_scaling.json',
                 'ch4_quality_budget.csv', 'ch4_quality_runs.csv', 'ch4_quality.json',
                 'validation_stability.csv', 'validation_prediction_strength.csv',
                 'validation_persistence.csv', 'validation_tests.json',
                 'fig4_9_importance.png', 'fig4_10_ablation.png', 'fig4_11_scaling.png',
                 'fig4_12_quality.png', 'fig4_13_critical_difference.png', 'fig4_14_tradeoff.png',
                 'fig4_15_validation.png',
                 'comparison_lono_summary.csv', 'comparison_random_kfold.csv',
                 'comparison_methods.csv', 'comparison_methods.json', 'ch4_methods.png',
                 'results_and_discussion.tex']):
    size = os.path.getsize(f) if os.path.exists(f) else 0
    w(f'  {f:<36} {size:>10,} bytes   sha {sha(f)}')

w()
w('=' * 78)
w('FAILED STEPS: ' + (', '.join(failed) if failed else 'none'))
w('=' * 78)

open(LOG, 'w').write('\n'.join(out) + '\n')
print(f'\nwrote {LOG}')
