---
name: release
description: Publish a new version of the Reviewa extension on GitHub
disable-model-invocation: true
argument-hint: [version-bump: patch|minor|major]
allowed-tools: Read, Edit, Write, Bash(*), Grep, Glob
---

Publish a new release of the Reviewa VS Code extension. Version bump type: $ARGUMENTS (default: patch).

Follow these steps in order:

## 1. Determine the new version

Read the current version from `package.json`. Apply the requested bump (patch/minor/major) to calculate the new version number.

## 2. Get changes since last release

Run `git diff` and `git log` against the last release tag to understand what changed. Categorise changes into Added, Fixed, Changed, and Removed sections.

## 3. Update `package.json`

Bump the `version` field to the new version.

## 4. Update `CHANGELOG.md`

Add a new entry at the top (below the header) with today's date and the categorised changes from step 2. Follow the existing format in the file.

## 5. Update `README.md` (if necessary)

If any user-facing features, requirements, or workflows changed, update the README to reflect them. If nothing user-facing changed, skip this step.

## 6. Update `CLAUDE.md` (if necessary)

If any architecture, key files, hook integration, or build details changed, update CLAUDE.md to reflect them. If nothing structural changed, skip this step.

## 7. Run unit tests

Run `npm run test:unit` and verify all tests pass. Do NOT proceed with the release if any test fails — fix the failures first.

## 8. Build the VSIX package

Run `npx @vscode/vsce package` to produce the `.vsix` file. Verify it succeeds.

## 9. Create GitHub release

Run `gh release create v<version> reviewa-<version>.vsix --title "v<version>" --notes "<changelog notes>"` to publish the release with the VSIX attached.

## 10. Fetch the release tag

Run `git fetch --tags origin` to pull the tag created by the GitHub release into the local repository.

## 11. Remind the user

Tell the user the GitHub release URL and remind them to upload `reviewa-<version>.vsix` to the VS Code Marketplace manually.
