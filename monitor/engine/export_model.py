import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from rules import STATE_CODE

FEAT = ["moisture_rel", "ph_rel", "temp_rel", "dmoist_1h", "dmoist_3h"]
CONFIG = dict(n_estimators=400, class_weight="balanced", bootstrap=True, random_state=0,
              min_samples_leaf=1, max_features=1, max_depth=None, n_jobs=-1)

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
check = Path(sys.argv[3]) if len(sys.argv) > 3 else None

d = pd.read_csv(src)
X = d[FEAT].clip(-5, 5).values
y = d.state_ref.map(STATE_CODE).values

rf = RandomForestClassifier(**CONFIG).fit(X, y)
classes = list(rf.classes_)

trees, impure = [], 0
for est in rf.estimators_:
    t = est.tree_
    leaf = t.children_left == -1
    value = t.value[:, 0, :]
    impure += int(((value > 0).sum(1) > 1)[leaf].sum())
    cls = value.argmax(1)
    trees.append(dict(
        f=[int(v) if not lf else -1 for v, lf in zip(t.feature, leaf)],
        t=[float(v) if not lf else 0 for v, lf in zip(t.threshold, leaf)],
        l=[int(v) for v in t.children_left],
        r=[int(v) for v in t.children_right],
        c=[int(v) if lf else -1 for v, lf in zip(cls, leaf)],
    ))

model = dict(features=FEAT, clip=5, classes=classes, trees=trees,
             source=src.name, config={k: v for k, v in CONFIG.items() if k != "n_jobs"})
dst.write_text("window.SOIL_MODEL = " + json.dumps(model, separators=(",", ":")) + ";\n", encoding="utf-8")

print("trees", len(trees), "nodes", sum(len(t["f"]) for t in trees), "impure leaves", impure,
      "bytes", dst.stat().st_size, "training accuracy", round(float((rf.predict(X) == y).mean()), 4))

if check:
    votes = np.zeros((len(X), len(classes)))
    for est in rf.estimators_:
        leaf_cls = est.tree_.value[:, 0, :].argmax(1)
        votes[np.arange(len(X)), leaf_cls[est.apply(X)]] += 1
    vote_pred = np.array(classes)[votes.argmax(1)]
    print("majority vote equals sklearn predict:", bool((vote_pred == rf.predict(X)).all()))
    pd.DataFrame(dict(node=d.node, ts=d.ts, **{f: X[:, i] for i, f in enumerate(FEAT)},
                      pred=rf.predict(X))).to_csv(check, index=False)
