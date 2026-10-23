# Version policy

## Selecting versions

- Track the latest official stable release for the main series.
- Resolve the version immediately before preparing a run. Record the exact tag/package version and source URL; never use an unpinned latest tag in the timed environment.
- Run alpha, beta, release-candidate, and nightly builds only in a clearly labeled prerelease series. Do not mix them into stable rankings. MkDocs 2.0 is currently such an experiment; its exact dev version and source commit must be pinned.
- Pin framework, theme, plugins, language runtimes, package-manager lockfiles, benchmark container digest, browser, and benchmark source commit.
- For MDU, record the repository commit and .NET SDK/runtime or container digest.
- Preserve older run manifests and raw data permanently. Adding a new release creates a new result series; it never overwrites a prior version.

## Adding a generator release

1. Update the participant's version pin and dependency lockfile.
2. Build the prepared environment and save its image digest.
3. Run the smoke corpus and the correctness/parity gate.
4. Record any compatibility or feature-matrix change.
5. If the adapter still works, add no version-specific code. If the CLI or output changed, keep a small version-specific adapter branch with a documented reason.
6. Run the full workload; publish raw samples and generated summaries together.

The goal is that a routine patch/minor release changes only the version pin and lockfile. Shared content and measurement code should not be copied per version.

## Release discovery

A scheduled workflow may check official release feeds and open a reviewable update proposal. It must not silently replace the pinned baseline or publish new benchmark claims without a completed parity and measurement run.

