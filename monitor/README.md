# Soil Condition Monitor

A minimal user application for the undergraduate thesis *Unsupervised Identification of Soil Condition States from Low Cost IoT Sensor Data with Random Forest Classification and a Threshold Based Expert System* (Ateneo de Davao University).

It shows, for five soil sensor nodes at a demonstration site in Davao City, the current soil condition state of each node, how long the node has held it, the past week of states, and the recommendation the rule base gives, with the rule that produced it and the published work behind that rule. It is designed first for smartphones.

The analysis that produces the states is in the root of this repository. Run every command below from this `monitor` folder.

<p>
  <img src="docs/screenshots/fig1_nodes.png" width="240" alt="Nodes view">
  <img src="docs/screenshots/fig1_advice.png" width="240" alt="Advice view">
  <img src="docs/screenshots/fig1_week.png" width="240" alt="Week view">
</p>

## What it is, and what it is not

- It **replays** the recorded deployment of 13 October to 13 November 2025, using the reference states of the thesis for every recorded reading.
- After the recorded month it can take **new readings**, either from a Firebase Realtime Database feed or from a simulator built into the page. Each new reading is classified in the browser by the Random Forest of the thesis and passed through the same rule engine.
- The new readings used for demonstrations are **simulated**, not measured. They are generated from each node's recorded behaviour, and the badge at the top of the app says **Simulated** whenever the newest reading came from the simulator. It says **Live** only for readings that did not come from the simulator, and **Replay** when the app shows the recorded month alone.
- It is not connected to the sensors. A gateway could write sensor readings to the same feed in the format given in [docs/live_demo.md](docs/live_demo.md).
- It has not yet been tested with farmers or extension agents.

## Run it

Open `app/index.html` in any browser, or the published copy at `https://brianbuenviaje.github.io/soil_condition_states/monitor/app/` once GitHub Pages is turned on. It can be installed on a phone as an app and works offline after the first visit.

The bar at the top sets the hour being shown. The bar at the bottom switches between four views:

| View | Shows |
| --- | --- |
| Nodes | Each node's state, hours held, latest reading, and the rules that apply, or that it is settling |
| Advice | Each active recommendation for the selected node, with its rule and, on request, the condition, the evidence, and the sources |
| Week | The selected node's states over the past seven days, and the hours spent in each |
| Rules | The eight rules of the rule base with their conditions and sources |

Where the new readings come from depends on the address:

| Address ends with | The app |
| --- | --- |
| `index.html` | uses the Firebase feed if `app/config.js` names a database and it answers within 8 seconds, otherwise its own simulator |
| `index.html?source=live` | uses the Firebase feed only, and shows Replay until the feed answers |
| `index.html?source=sim` | uses its own simulator, steered by the control page in the same browser |
| `index.html?source=replay` | shows the recorded month only, exactly as in Appendix B of the thesis |

The control page, `app/control.html`, starts and steers the demonstration: speed, pause, skipping ahead, scenarios such as a flood or a dry spell at a chosen node, and a reset. How to set up Firebase, publish the app and run the demonstration is in [docs/live_demo.md](docs/live_demo.md).

## How new readings are classified

A new reading is turned into the five features of the thesis: moisture, pH and temperature relative to the node's median and interquartile range, and the moisture change over one and three hours. The medians and ranges come from every reading of that node up to that moment, never from later ones. The Random Forest in `app/model.js` is the one of the thesis (400 trees, the configuration used in the thesis), trained on `input/soil_states_k4.csv` and exported tree by tree; its predictions match scikit-learn on every training reading.

Because the reference states use the whole record for their medians and ranges, while a live system can only use the past, the two agree on 69.9 percent of the recorded readings when the record is replayed reading by reading, and on 77.5 percent after the first week. The recorded month is therefore always shown with its reference states, and only readings after it are classified live.

## Layout

```
app/          the web app: index.html, app.js, style.css, data.js, fonts, logo
              live.js, engine.js, simulator.js, model.js, config.js  new readings
              control.html, control.js, control.css                  the control page
              manifest.webmanifest, sw.js, icons                     installing and offline use
engine/       the rule engine and helper scripts (Python)
input/        the state of every reading, from the analysis pipeline
design/       the Tailwind CSS source for app/style.css and app/control.css
firebase/     the database rules for the live feed
tests/        checks of the browser engine and model against the Python ones
docs/         the live demonstration guide and the screenshots used in Appendix B of the thesis
```

## Rebuild

Rebuild `app/data.js` after changing the rules or the input (Python 3 with pandas and numpy):

```
python engine/build_data.py input/soil_states_k4.csv app/data.js
```

The script also prints how often each rule applies over the whole record, which should agree with the rule table of Chapter Four of the thesis (R3 once, at Node 04; R5 never; R6 at Node 04 only).

Rebuild `app/model.js` after changing the input (also needs scikit-learn):

```
python engine/export_model.py input/soil_states_k4.csv app/model.js
```

Rebuild `app/style.css` and `app/control.css` after changing classes (Node.js):

```
cd design
npm install
npm run build
npm run build:control
```

After changing any file in `app`, change `VERSION` in `app/sw.js` so installed copies fetch the new files.

Retake the screenshots (Python with playwright and its Chromium browser):

```
python engine/screenshots.py app/index.html docs/screenshots
```

## Checks

Run from this folder with Node.js:

```
python engine/export_model.py input/soil_states_k4.csv app/model.js rf_check.csv
node tests/check_model.js rf_check.csv app/model.js
node tests/check_engine.js input/soil_states_k4.csv app/model.js app/data.js
node tests/check_live_classify.js input/soil_states_k4.csv app/model.js
node tests/check_scenarios.js
```

The first two confirm that the exported forest gives the same state as scikit-learn for every training reading. The third confirms that the browser rule engine gives the same rules as `engine/rules.py` for all 3,029 readings. The fourth measures the agreement given above. The last runs every scenario of the control page and confirms that it produces the rules it promises. `tests/fake_rtdb.js` is a small stand in for the Firebase database, for trying the control page without a Firebase project.

## The rules

Rules R1 to R8 are those of the thesis rule base. The engine makes their conditions operational as follows.

| Rule | Applies when |
| --- | --- |
| R1 | S1 has lasted longer than the node's recovery interval (median of its earlier S1 recoveries; one hour until it has one) |
| R2 | S1 readings fall on four or more days of the current calendar week at the node |
| R3 | A run of S3 or S4 readings, counted together, is longer than 24 hours |
| R4 | The node is in S2 |
| R5 | A run of S4 is longer than 48 hours and the median of its valid pH readings is below 5.5 |
| R6 | The node's median conductivity to date is below that of every other node |
| R7 | A reading is outside its physical range (moisture 0 to 100 percent, pH 3 to 10, temperature 0 to 45 degrees, conductivity 0 to 2 dS/m) |
| R8 | Less than 24 hours have passed since the node's first reading; no other rule is shown |

Two readings count as consecutive when they are 45 to 75 minutes apart. Where no rule applies, the application says that no advice is given, and where several apply, all are shown, as the rule base defines no default and no precedence. The second condition of R7, all nodes stepping together, is not implemented.

## Planned changes

- Show the selected date and hour on the time slider while it is being dragged, so it is clear what the slider does.
