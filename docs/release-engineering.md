# Release Engineering — NossoCRM

Complete guide to release management, versioning, and changelog automation for NossoCRM.

## Quick Start

```bash
# 1. Develop features on feature/* branches with conventional commits
git checkout -b feature/add-api-v2
git commit -m "feat(api): add v2 REST endpoints for deals"
git push origin feature/add-api-v2

# 2. Create PR and merge to main
gh pr create --title "feat: Add public API v2"
gh pr merge 123 --squash

# 3. When ready to release, prepare the release
npm run release:prepare
npm run release:draft      # Preview changelog
npm run release:tag        # Create git tag and update CHANGELOG.md

# 4. Push to GitHub (triggers GitHub Actions)
git push origin main
git push origin v0.2.0

# 5. GitHub automatically creates release from CHANGELOG.md
```

## Setup

### Configuration Files

- **`.commitlintrc.json`** — Conventional commit validation rules
- **`CHANGELOG.md`** — Maintained in "Keep a Changelog" format
- **`RELEASE.md`** — Release process documentation
- **`scripts/release.mjs`** — Automation script for version bumping
- **`.github/workflows/ci.yml`** — Commitlint validation on PRs
- **`.github/workflows/release.yml`** — GitHub Release creation

### Package.json Scripts

```json
{
  "scripts": {
    "release:prepare": "node scripts/release.mjs prepare",
    "release:draft": "node scripts/release.mjs draft",
    "release:tag": "node scripts/release.mjs tag"
  }
}
```

## Workflow

### Development

1. Create feature branch: `git checkout -b feature/xxx`
2. Commit with conventional format: `git commit -m "feat(scope): description"`
3. Push and create PR: `gh pr create ...`
4. Pass all checks (lint, test, commitlint)
5. Squash merge to main: `gh pr merge 123 --squash`

### Release Preparation

```bash
npm run release:prepare
```

Analyzes commits since last tag and suggests version bump:

```
📊 Release Analysis
Current version: 0.1.0
Latest tag: v0.1.0

📈 Suggested version bump: MINOR
   0.1.0 → 0.2.0

📝 Changes breakdown:
   Breaking: 0
   Features: 3
   Fixes: 5
   Refactors: 2
   Docs: 1
```

### Changelog Preview

```bash
npm run release:draft
```

Shows changelog entry that will be added:

```markdown
## [0.2.0] - 2026-04-09

### Added
- feat(api): add v2 REST endpoints

### Fixed
- fix(webhook): handle concurrent processing
```

### Release Creation

```bash
npm run release:tag
```

Automatically:
1. Updates `CHANGELOG.md`
2. Updates `package.json` version
3. Creates commit `chore(release): v0.2.0`
4. Creates annotated git tag `v0.2.0`

Then push to GitHub:

```bash
git push origin main
git push origin v0.2.0
```

### GitHub Release

The `.github/workflows/release.yml` workflow:
1. Extracts version from tag
2. Reads changelog section
3. Creates GitHub Release
4. Links to full diff

## Commit Message Format

```
type(scope): description

[optional body]
[optional footer]
```

### Type

- `feat` — New feature (→ minor version)
- `fix` — Bug fix (→ patch version)
- `feat!` — Breaking change (→ major version)
- `refactor` — Code reorganization
- `docs` — Documentation
- `test` — Test additions
- `chore` — Build, dependencies
- `ci` — CI/CD configuration
- `perf` — Performance
- `style` — Formatting

### Scope

Optional. Usually a domain: `api`, `messaging`, `ai`, `auth`, `db`, etc.

### Description

Imperative mood, lowercase, no period.
```
✅ add user authentication
❌ Added user authentication
❌ adds user authentication
```

### Examples

```bash
# Feature
git commit -m "feat(api): add v2 REST endpoints for deals"

# Bug fix
git commit -m "fix(webhook): handle concurrent message processing"

# Breaking change
git commit -m "feat(api)!: rename /deals to /opportunities"

# With body
git commit -m "feat(messaging): add email channel support

Adds Resend integration for email messaging.

Closes #456"

# Simple fix
git commit -m "fix: typo in error message"
```

## Conventional Commits Validation

### Local Development (Optional)

The `.commitlintrc.json` is only validated in CI, not in pre-commit hooks.

If you want local validation, install manually:

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
npx commitlint --edit $1
```

### In GitHub Actions

The `commitlint` job on every PR validates all commits:

```bash
npx commitlint --from <base> --to <head>
```

If validation fails, squash and amend commits:

```bash
git rebase -i origin/main
# Edit commits to follow "type(scope): description"
git push --force-with-lease
```

## Semantic Versioning

### Version Components

```
v1.2.3
  │ │ └─ PATCH (bug fixes)
  │ └─── MINOR (new features, backwards compatible)
  └───── MAJOR (breaking changes)
```

### Version Strategy

| Version | Use Case | Example |
|---------|----------|---------|
| MAJOR | Breaking API changes | v1.0.0 → v2.0.0 |
| MINOR | New features (backward compatible) | v1.0.0 → v1.1.0 |
| PATCH | Bug fixes | v1.0.0 → v1.0.1 |

### NossoCRM Strategy

Currently in **0.x.y** (development phase):

| Version Range | Status | When to Release |
|---------------|--------|-----------------|
| 0.1.x | MVP | Current release |
| 0.2.x | Public APIs | Q2 2026 |
| 1.0.0 | General availability | When stable |

**Release to 1.0.0 when:**
- All messaging providers stabilized
- Public APIs are frozen
- Security audit passed
- Comprehensive documentation complete

## Changelog Management

### Format

Uses "Keep a Changelog" format with sections:

```markdown
## [Unreleased]

### Added
- (New features)

### Changed
- (Changes to existing features)

### Fixed
- (Bug fixes)

### Removed
- (Removed features)

### Deprecated
- (Deprecated features)

---

## [1.2.3] - 2026-04-15

### Added
- Feature description

### Fixed
- Fix description
```

### Updating Changelog

The `release:tag` script automatically updates `CHANGELOG.md` by:
1. Extracting commits since last tag
2. Categorizing by type (feat, fix, refactor, etc.)
3. Formatting with commit hashes
4. Inserting under `## [Unreleased]` section

For manual updates, edit `CHANGELOG.md` directly and commit before tagging.

## Release Lifecycle

### Versions in Development

1. **Unreleased** — Changes not yet released
2. **Alpha** (v0.2.0-alpha.1) — Early testing, breaking changes possible
3. **Beta** (v0.2.0-beta.1) — Feature complete, bugs expected
4. **RC** (v0.2.0-rc.1) — Release candidate, no new features
5. **Release** (v0.2.0) — General availability

### Creating Pre-releases

```bash
# Create alpha
git tag -a v0.2.0-alpha.1 -m "Release v0.2.0-alpha.1"
git push origin v0.2.0-alpha.1

# Test and fix...

# Create beta
git tag -a v0.2.0-beta.1 -m "Release v0.2.0-beta.1"
git push origin v0.2.0-beta.1

# Test and fix...

# Create RC
git tag -a v0.2.0-rc.1 -m "Release v0.2.0-rc.1"
git push origin v0.2.0-rc.1

# Final release
npm run release:tag
git push origin main v0.2.0
```

## Troubleshooting

### Validation Fails

Check commit history:
```bash
git log --oneline -10
```

Must follow: `type(scope): description`

Fix:
```bash
git rebase -i origin/main
# Edit commits, save
git push --force-with-lease
```

### Wrong Version Suggested

Check analysis:
```bash
npm run release:prepare
```

Shows breakdown of commits by type.

Ensure commits use correct types:
- `feat:` for new features
- `fix:` for bug fixes
- `feat!:` for breaking changes

### Need to Redo Release

If you created a tag and want to redo:

```bash
git tag -d v0.2.0           # Delete local tag
git push origin :refs/tags/v0.2.0  # Delete remote tag
npm run release:prepare      # Check again
npm run release:tag          # Create new tag
```

## Standards

| Standard | URL |
|----------|-----|
| Semantic Versioning 2.0.0 | https://semver.org/ |
| Conventional Commits 1.0.0 | https://www.conventionalcommits.org/ |
| Keep a Changelog | https://keepachangelog.com/ |

## References

- [RELEASE.md](../RELEASE.md) — Detailed release workflow
- [CHANGELOG.md](../CHANGELOG.md) — Project changelog
- [.commitlintrc.json](../.commitlintrc.json) — Validation rules
