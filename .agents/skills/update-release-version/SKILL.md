---
name: update-release-version
description: Updates the release version across package.json, tauri.conf.json, Cargo.toml, and release notes files.
version: "1.0.2"
---

# Update Release Version Skill

## Description

This skill helps update the release version across all relevant files in the Talk project when a new version is requested.

## Scope

This skill performs **version updates only**. Its sole purpose is to change the version number and the files that carry it.

- Do **not** bundle any other topic into the same change: no features, fixes, refactors, dependency bumps, documentation rewrites, or configuration changes.
- Do **not** edit code, SQL, or behavior while running this skill.
- The only permitted edits are the version strings listed under [Files Updated](#files-updated) and the release-notes file rename/header.
- If the request also asks for unrelated work, complete that work separately (before or after), and keep the version bump as its own isolated change.
- If a file needs a change that is not a version update, stop and report it instead of making the change here.

## Usage

When you want to update to a new version (e.g., `1.0.1`), use this skill by requesting:

> "Update release version to 1.0.1"

or

> "Create a release version skill and update to 1.0.1"

## Files Updated

The skill updates the following files with the new version:

1. **chat-frontend/package.json** - npm package version
2. **chat-frontend/src-tauri/tauri.conf.json** - Tauri app version
3. **chat-frontend/src-tauri/Cargo.toml** - Rust crate version
4. **RELEASE_NOTES_v{old_version}.md** - Renamed to **RELEASE_NOTES_v{new_version}.md**

## Example

```
User: "Update release version to 1.0.1"
```

The skill will:
1. Update version in `package.json`
2. Update version in `tauri.conf.json`
3. Update version in `Cargo.toml`
4. Rename `RELEASE_NOTES_v1.0.0.md` to `RELEASE_NOTES_v1.0.1.md`
5. Update the version header in the release notes file

## Integration with Large Modifications

When making large modifications to the codebase, consider using this skill as part of your workflow. A good practice is to:

1. Complete all code changes
2. Run tests to verify functionality
3. Update the release version using this skill — as an isolated step that touches version strings only
4. Commit with a clear version tag

This ensures version consistency across all project files. Any summary of the code changes belongs to the change that made them, not to this skill's version-only step.
