# SkyboxTime Worlds Repro

Minimal Decentraland SDK7 scene demonstrating that `SkyboxTime.fixedTime`
is silently ignored when deployed to a Decentraland **World**, while the
identical code works correctly in local Creator Hub preview.

See `docs/bug-report.md` for the full write-up.

## Repro

```bash
npm install
npm start          # local preview: sky renders as dawn, RUNTIME=21600
npm run deploy     # deploy to any World: sky renders default blue, RUNTIME drifts
```

The scene:

- writes `SkyboxTime { fixedTime: 21600, transitionMode: TM_FORWARD }` to
  `engine.RootEntity` once at load,
- logs `getWorldTime()` every second so the divergence between the written
  value and the runtime value is visible in the console,
- places one red cube at (8, 1, 8) as a "did the scene load?" anchor.

Toggle `CONTINUOUS_WRITES = true` in `src/index.ts` to also test the
10 Hz continuous-write variant (same result on Worlds).

## Environments tested

| Environment                         | Behaviour                                          |
| ----------------------------------- | -------------------------------------------------- |
| Local Creator Hub preview           | Works — dawn sky, `RUNTIME=21600`, `LOCKED=true`   |
| Deploy to World (`snowdrift.dcl.eth`) | Broken — default sky, `RUNTIME` drifts, `LOCKED=true` |

## SDK version

`@dcl/sdk@7.26.1-32860802198.commit-dae48fb` (pinned exact).
