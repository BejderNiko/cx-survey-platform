# WebR runtime

The R workspace loads WebR `v0.4.2` from `https://webr.r-wasm.org/v0.4.2/webr.mjs` only after a user opens the workspace. Calculations and datasets stay in the browser runtime; the analytics API is not used for WebR execution.

## Browser smoke

1. Sign in as a user with `analytics.run`.
2. Open `/analytics`.
3. Choose a dataset version and select **Load into R**.
4. Run `nrow(survey_data)`.
5. Confirm output equals dataset row count shown in the preview.
6. Run `hist(survey_data[[first_numeric]])` after defining `first_numeric`; confirm plot, or controlled R error.

The UI reports loading, ready, running, completion, timeout, and controlled error states. Runtime load, start, graphics setup, and calculations time out after 20 seconds. A zero-row dataset never starts the runtime.

Upgrade the pinned version only after rerunning this smoke at local, Preview, and supported browser versions.
