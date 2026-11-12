import json
import sys
from pathlib import Path

import pandas as pd

from rules import RULES, STATES, evaluate, out_of_range

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

d = pd.read_csv(src)
r = evaluate(d)

nodes = {}
for n, g in r.groupby("node"):
    nodes[n] = [dict(t=x.ts.strftime("%Y-%m-%dT%H:%M:%S"), s=x.state, h=int(x.held_h), dr=int(x.drier_run_h),
                     m=x.moisture, ph=x.ph, tc=x.temp, ec=x.ec, st=x.settling,
                     r=list(x.rules), i=x.info, mr=x.moisture_rel) for x in g.itertuples(index=False)]

payload = dict(source=src.name, start=r.ts.min().strftime("%Y-%m-%dT%H:%M:%S"),
               end=r.ts.max().strftime("%Y-%m-%dT%H:%M:%S"), states=STATES, rules=RULES, nodes=nodes)
dst.write_text("window.SOIL_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n", encoding="utf-8")

def runs(mask_rule):
    count = 0
    for n, g in r.groupby("node"):
        on = g.rules.apply(lambda x: mask_rule in x).values
        count += int(sum(1 for i in range(len(on)) if on[i] and (i == 0 or not on[i - 1])))
    return count

print("readings", len(r))
for k in RULES:
    hit = r[r.rules.apply(lambda x: k in x)]
    print(k, "readings", len(hit), "episodes", runs(k), "nodes", sorted(hit.node.unique()))
print("R7 condition met in the record", int(sum(bool(out_of_range(x._asdict())) for x in d.itertuples(index=False))))
print("no rule fires", int((r.rules.apply(len) == 0).sum()))
ex = r[(r.node == "Node-04") & (r.ts.dt.strftime("%Y-%m-%d %H") == "2025-10-19 14")]
print(ex[["ts", "state", "held_h", "drier_run_h", "rules"]].to_string(index=False))
