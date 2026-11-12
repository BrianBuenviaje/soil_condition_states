import numpy as np
import pandas as pd

STATE_CODE = {
    "Saturated": "S1",
    "Moist / cooler": "S2",
    "Drier / higher pH": "S3",
    "Drier / lower pH": "S4",
}

STATES = {
    "S1": "Saturated",
    "S2": "Moist and cooler",
    "S3": "Drier, higher pH",
    "S4": "Drier, lower pH",
}

RULES = {
    "R1": dict(state="S1",
               condition="S1 persists beyond the recovery interval observed at that node",
               action="Hold the next scheduled irrigation and inspect drainage",
               basis="Oxygen is depleted within hours of saturation and aerobic populations decline",
               cites=["Patel et al., 2024", "Das et al., 2025", "Pawar et al., 2025"]),
    "R2": dict(state="S1",
               condition="S1 events recur on most days of a week at one node",
               action="Reduce irrigation frequency at this node",
               basis="Repeated wetting pulses and prolonged wet periods shift the community toward anaerobes",
               cites=["Manzoni et al., 2020", "Hao et al., 2025"]),
    "R3": dict(state="S3, S4",
               condition="S3 or S4 persists beyond twenty four hours with no intervening S1 event",
               action="Schedule irrigation",
               basis="Threshold based scheduling from soil moisture sensors is established practice",
               cites=["Munyaradzi et al., 2022", "Dong et al., 2024", "Abdelmoneim et al., 2025"]),
    "R4": dict(state="S2",
               condition="S2, the moist and cooler state",
               action="Maintain current management; no action",
               basis="This range sits near the aerobic optimum",
               cites=["Linn and Doran, 1984", "Hao et al., 2025"]),
    "R5": dict(state="S4",
               condition="S4 persists beyond forty eight hours and site pH is below 5.5",
               action="Recommend a laboratory pH test and a liming consultation",
               basis="Bacterial diversity declines sharply below pH 5 and liming is the standard remedy",
               cites=["Wang et al., 2022", "Zhou et al., 2024", "Enesi et al., 2023"]),
    "R6": dict(state="None",
               condition="The node's conductivity profile sits persistently below those of the other nodes",
               action="Flag the location for laboratory nutrient testing; issue no fertiliser recommendation",
               basis="The nutrient outputs are derived from conductivity and are not independent measurements",
               cites=["Baldi et al., 2026", "Sulaeman et al., 2024"]),
    "R7": dict(state="None",
               condition="A reading falls outside its physically attainable range",
               action="Quarantine the affected reading and raise a hardware check",
               basis="Automated data quality screening is standard in recent monitoring systems",
               cites=["Pulungan et al., 2026", "Han et al., 2026"]),
    "R8": dict(state="None",
               condition="Fewer than twenty four hours have elapsed since the probe was placed",
               action="Issue no recommendation; report the node as settling",
               basis="In situ probes require twelve to twenty four hours to stabilise",
               cites=["Eldeeb et al., 2023"]),
}

BOUNDS = dict(moisture=(0, 100), ph=(3, 10), temp=(0, 45), ec=(0, 2))
SETTLING_H = 24
R1_DEFAULT_H = 1.0
R1_WINDOW_H = 12
R2_DAYS = 4
R3_H = 24
R5_H = 48
R5_PH = 5.5


def consecutive(prev_ts, ts):
    if prev_ts is None:
        return False
    gap = (ts - prev_ts) / pd.Timedelta(hours=1)
    return 0.75 <= gap <= 1.25


def out_of_range(row):
    return [k for k, (lo, hi) in BOUNDS.items() if not (lo <= row[k] <= hi)]


def recovery_times(g):
    eps = []
    ts = g.ts.values
    st = g.state.values
    mr = g.moisture_rel.values
    for i in range(len(g)):
        if st[i] == "S1" and (i == 0 or st[i - 1] != "S1"):
            start = ts[i]
            done = None
            for j in range(i + 1, len(g)):
                h = (ts[j] - start) / np.timedelta64(1, "h")
                if h > R1_WINDOW_H:
                    break
                if abs(mr[j]) <= 0.5:
                    done = (ts[j], h)
                    break
            if done:
                eps.append(dict(start=pd.Timestamp(start), known_at=pd.Timestamp(done[0]), hours=done[1]))
    return eps


def evaluate(d):
    d = d.copy()
    d["ts"] = pd.to_datetime(d.ts)
    d["state"] = d.state_ref.map(STATE_CODE)
    d = d.sort_values(["ts", "node"]).reset_index(drop=True)
    nodes = sorted(d.node.unique())
    first = d.groupby("node").ts.min().to_dict()
    rec = {n: recovery_times(d[d.node == n].reset_index(drop=True)) for n in nodes}
    ec_hist = {n: [] for n in nodes}
    track = {n: dict(prev_ts=None, prev_state=None, held=0, drier=0, s1=0, s4=0, s4_ph=[]) for n in nodes}
    out = []
    for row in d.itertuples(index=False):
        n, t, s = row.node, row.ts, row.state
        k = track[n]
        cons = consecutive(k["prev_ts"], t)
        k["held"] = k["held"] + 1 if cons and k["prev_state"] == s else 1
        k["drier"] = k["drier"] + 1 if cons and s in ("S3", "S4") and k["prev_state"] in ("S3", "S4") else (1 if s in ("S3", "S4") else 0)
        k["s1"] = k["held"] if s == "S1" else 0
        if s == "S4":
            k["s4"] = k["held"]
            k["s4_ph"] = (k["s4_ph"] if k["held"] > 1 else []) + ([row.ph] if 3 <= row.ph <= 10 else [])
        else:
            k["s4"], k["s4_ph"] = 0, []
        k["prev_ts"], k["prev_state"] = t, s
        if 0 <= row.ec <= 2:
            ec_hist[n].append(row.ec)
        bad = out_of_range(row._asdict())
        settling = (t - first[n]) < pd.Timedelta(hours=SETTLING_H)
        fired = []
        info = {}
        if settling:
            fired.append("R8")
        else:
            if s == "S1":
                known = [e["hours"] for e in rec[n] if e["known_at"] <= t]
                interval = float(np.median(known)) if known else R1_DEFAULT_H
                info["recovery_interval_h"] = round(interval, 2)
                if k["s1"] > interval:
                    fired.append("R1")
            wk_start = (t - pd.Timedelta(days=t.weekday())).normalize()
            days = d[(d.node == n) & (d.state == "S1") & (d.ts >= wk_start) & (d.ts <= t)].ts.dt.normalize().nunique()
            if days >= R2_DAYS:
                fired.append("R2")
            if k["drier"] > R3_H:
                fired.append("R3")
            if s == "S2":
                fired.append("R4")
            if s == "S4" and k["s4"] > R5_H and k["s4_ph"] and float(np.median(k["s4_ph"])) < R5_PH:
                fired.append("R5")
            others = [np.median(ec_hist[m]) for m in nodes if m != n and ec_hist[m]]
            if ec_hist[n] and len(others) == len(nodes) - 1 and np.median(ec_hist[n]) < min(others):
                fired.append("R6")
            if bad:
                fired.append("R7")
                info["out_of_range"] = bad
        out.append(dict(node=n, ts=t, state=s, held_h=k["held"], drier_run_h=k["drier"],
                        moisture=round(row.moisture, 2), ph=round(row.ph, 2), temp=round(row.temp, 2),
                        ec=round(row.ec, 3), settling=bool(settling), rules=fired, info=info,
                        moisture_rel=round(float(row.moisture_rel), 6)))
    return pd.DataFrame(out)
