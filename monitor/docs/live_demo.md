# Running the live demonstration

The app shows the recorded month of 13 October to 13 November 2025 and then keeps going with new readings, one simulated hour every few seconds. A separate control page sets the pace and starts scenarios, such as a flood at one node, so that the panel can watch the states and the advice change.

The new readings are simulated from each node's recorded behaviour. They are not measurements, and the badge at the top of the app says **Simulated** while they are shown.

There are two ways to run it.

| | This browser | Firebase |
| --- | --- | --- |
| Setup | None | About 10 minutes, once |
| Who sees the readings | Tabs of the same browser on the same computer | Any phone or laptop with the link |
| Internet during the demo | Not needed after the first visit | Needed |

The control page can switch between the two at any time. If Firebase fails during the demo, switch to This browser and carry on.

## The addresses

Once GitHub Pages is on (see below), the app is at

```
https://brianbuenviaje.github.io/soil_condition_states/monitor/app/
```

and the control page is `control.html` in the same folder. The control page shows the right link to share and has a button that copies it.

## Option 1: this browser only

1. Open `control.html`. Choose **This browser**.
2. Press **Open the app**. It opens `index.html?source=sim` in a new tab.
3. Put the two windows side by side, or show the app on the projector and keep the control page on the laptop screen.

The control page shows **App open** once it can see the app. Reloading the app starts its simulation again from the end of the recorded month.

## Option 2: Firebase, for phones in the room

### Create the database (once)

1. Go to the Firebase console, add a project (Google Analytics is not needed), and open it.
2. Open **Realtime Database** and create a database. Choose the Singapore location (asia-southeast1) and start in **locked mode**.
3. In the database, open the **Rules** tab, replace everything with the contents of `monitor/firebase/database.rules.json`, and publish.
4. Open **Authentication**, get started, and on the **Sign-in method** tab turn on **Anonymous**.
5. Open **Project settings** (the gear), and under **Your apps** add a **Web** app. Hosting is not needed. Firebase then shows a `firebaseConfig` block.
6. Copy two values from it into `monitor/app/config.js`:

```js
window.SOIL_CONFIG = {
  firebase: {
    databaseURL: "https://YOUR-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
    apiKey: "YOUR-WEB-API-KEY",
    authURL: "https://identitytoolkit.googleapis.com/v1",
  },
  simulator: {
    secondsPerHour: 3,
    seed: 7,
  },
};
```

If `databaseURL` is missing from the block, copy it from the top of the Realtime Database page.

7. Change `VERSION` in `monitor/app/sw.js` (for example to `scm-2025-11-v2`), then commit and push.

The web API key of a Firebase web app is not a password. It only names the project, and the rules decide who may do what: anyone with the link can read the demonstration feed, and only a signed in page can write to it. After the defence you can turn Anonymous sign in off or delete the database.

### Run it

1. Open `control.html`. It should say **Connected** and choose **Firebase** by itself.
2. Press **Copy link for phones** and share it, or open it on the projector. The link ends in `?source=live`, so a phone that cannot reach the database shows **Replay** rather than quietly running a simulation of its own.
3. Keep the control page open and visible for the whole demonstration. It is the one making the readings.

Open the control page on one computer only. Reloading it keeps every reading already sent, but ends any scenario that was still running.

## Turn on GitHub Pages (once)

1. On GitHub, open the repository, then **Settings**, then **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
3. After a minute or two the address above starts working. The empty `.nojekyll` file at the top of the repository makes GitHub serve the files as they are.

## Install it on a phone

Open the app link, then:

- Android, Chrome: open the menu and choose **Install app** or **Add to Home screen**.
- iPhone, Safari: tap **Share**, then **Add to Home Screen**.

It then opens full screen like any other app, and works offline with the built in simulator.

## A demonstration of about seven minutes

Before the panel arrives: open the control page, press **Reset the demo** twice, choose a speed of 3 s, and press **Pause**.

1. **The recorded month.** On the app, drag the slider back into October and show the Week view of Node 01. Say that these are the real readings and their reference states.
2. **New readings.** Press **Resume**. Every 3 seconds a new hour arrives, the slider follows it, and the date under the title moves on. Each new reading is classified by the Random Forest inside the app. Point out the Simulated badge.
3. **A flood.** Press **Pause**. Pick node 01, start **Prolonged flood**, then press **+1 h** twice. On the app, Node 01 is S1 Saturated with R1 (hold irrigation, inspect drainage) and R7 (the reading is at the sensor ceiling). Open **Why this advice** to show the condition, the evidence and the sources.
4. **Why Node 02 behaves differently.** Pick node 02. The flood card explains that this node usually takes about 4 h to recover, so a 3 h flood is normal there and R1 stays quiet. This shows that R1 is set per node from its own history.
5. **An acidic dry spell.** Pick node 05, start **Acidic dry spell**, then press **+24 h** and **+6 h**. Node 05 is S4 with R3 (schedule irrigation). Press **+24 h** again: R5 (a laboratory pH test and a liming consultation) joins it.
6. **A sensor fault.** Pick node 03, start **Sensor fault**, press **+1 h**. Node 03 shows R7 (quarantine the reading and raise a hardware check) for that reading only.
7. **A new probe.** Pick node 04, start **Install new probe**, press **+1 h**. Node 04 shows Settling and no advice for the next 24 hours (R8).
8. **A silent node.** Pick node 02, start **Go offline**, press **+6 h**. The Nodes view warns that Node 02 has had no reading for 6 h. Start **Back online** to finish.

Press **Reset the demo** twice at the end. Each step above was checked in advance across 72 different runs of the simulator.

If someone asks whether the readings are real: the month on the slider is the recorded deployment; everything after it is simulated from that record to show how the app responds, and the app labels it Simulated.

## Things to know

- Each node learns its recovery interval from its own floods. After a demonstration flood, that node's interval includes the new flood, so a second flood at the same node may not trigger R1. Use another node or reset.
- Node 04 shows R6 most of the time, because its conductivity is the lowest of the five, as in the recorded month.
- **+24 h** sends 24 hours of readings at once. Firebase handles this easily; there is no need to wait between presses.
- A scenario starts at the next simulated hour, and one scenario per node runs at a time. **Back to normal** cancels it.

## The feed, for a real gateway

Readings live under `/live/feed` in the database. Each one is a child whose key sorts by time, `t` followed by the time in milliseconds padded to 15 digits, then `_r_` and the node name:

```json
"t001763038740000_r_Node-01": { "kind": "reading", "node": "Node-01", "t": 1763038740000, "m": 74.2, "ph": 6.81, "tc": 24.3, "ec": 0.41 }
```

`t` is the local Davao time written as if it were UTC, in milliseconds, as in the recorded data. `m` is moisture in percent, `ph` is pH, `tc` is temperature in degrees Celsius, and `ec` is conductivity in dS/m. A new probe is marked by a child with `"kind": "install"` and the key part `_i_` instead of `_r_`. Readings written without `"src": "sim"` make the badge say Live.
