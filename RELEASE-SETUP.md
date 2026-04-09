# Release Engineering Setup — Complete

✅ **Release engineering for NossoCRM is now fully configured.**

This document summarizes what was set up and how to use it.

## What Was Implemented

### 1. Conventional Commits Validation
- **File**: `.commitlintrc.json`
- **Type**: Configuration for commitlint
- **Rules**: Validates commit format on all PRs (GitHub Actions job)
- **Format**: `type(scope): description`

**Types supported**:
- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code reorganization
- `docs` — Documentation
- `test` — Tests
- `chore` — Maintenance
- `ci` — CI/CD
- `perf` — Performance
- `style` — Formatting

### 2. Changelog Management
- **File**: `CHANGELOG.md`
- **Format**: Keep a Changelog
- **Initial content**: 0.1.0 release with all recent features and fixes
- **Auto-update**: Updated by `npm run release:tag`

### 3. Release Automation Scripts
- **File**: `scripts/release.mjs`
- **Functions**:
  - `npm run release:prepare` — Analyze commits and suggest version
  - `npm run release:draft` — Preview changelog
  - `npm run release:tag` — Create tag and update CHANGELOG.md

**Example output**:
```
📊 Release Analysis
Current version: 0.1.0
Latest tag: v1.0.0

📈 Suggested version bump: MINOR
   0.1.0 → 0.2.0

📝 Changes breakdown:
   Breaking: 0
   Features: 64
   Fixes: 62
   Refactors: 13
   Docs: 5
```

### 4. GitHub Actions Workflows

#### Commitlint Job (in `.github/workflows/ci.yml`)
- **Trigger**: Every PR to main
- **Action**: Validates all commits follow conventional format
- **Failure**: PR shows failed check if commits don't match format

#### Release Workflow (`.github/workflows/release.yml`)
- **Trigger**: Tag push with `vX.Y.Z` format
- **Action**: Creates GitHub Release
- **Notes**: Auto-extracted from CHANGELOG.md
- **Link**: Full diff between releases

### 5. Documentation
- **`RELEASE.md`** — Detailed release workflow and troubleshooting
- **`docs/release-engineering.md`** — Setup guide and best practices
- **`RELEASE-SETUP.md`** — This file

## Quick Start Workflow

### 1. Develop Features
```bash
git checkout -b feature/add-new-api
git commit -m "feat(api): add new endpoints"
git push origin feature/add-new-api
gh pr create --title "feat: Add new API"
```

### 2. Review & Merge
```bash
# After approval
gh pr merge 123 --squash
```

### 3. Prepare Release
```bash
npm run release:prepare
npm run release:draft      # Review changes
npm run release:tag        # Create tag
```

### 4. Push to GitHub
```bash
git push origin main
git push origin v0.2.0
```

**Result**: GitHub Actions automatically creates the GitHub Release.

## Files Created

| File | Purpose | Size |
|------|---------|------|
| `.commitlintrc.json` | Commitlint configuration | 581 B |
| `CHANGELOG.md` | Project changelog | 3.5 KB |
| `RELEASE.md` | Release process guide | 7.9 KB |
| `scripts/release.mjs` | Release automation script | 9.8 KB |
| `.github/workflows/release.yml` | GitHub Release creation | 3.1 KB |
| `.github/workflows/ci.yml` (updated) | Added commitlint job | — |
| `package.json` (updated) | Added release scripts | — |
| `docs/release-engineering.md` | Setup & best practices | 7.9 KB |

## Version Strategy

**Current Phase**: 0.x.y (Development)

| Version | Timeline | Status |
|---------|----------|--------|
| 0.1.x | Current | MVP released |
| 0.2.x | Q2 2026 | Public API planned |
| 1.0.0 | Future | GA planned |

**Release to 1.0.0 when**:
- All messaging providers stabilized (Meta, Evolution, Email, Telegram, Instagram)
- Public REST/GraphQL APIs frozen
- Security audit passed
- Documentation complete

## Semantic Versioning

```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes (feat!)
MINOR: New features (feat)
PATCH: Bug fixes (fix)
```

## Commit Format Examples

```bash
# Feature
git commit -m "feat(api): add v2 REST endpoints"

# Bug fix
git commit -m "fix(webhook): handle concurrent processing"

# Breaking change
git commit -m "feat(api)!: rename /deals to /opportunities"

# With body
git commit -m "feat(messaging): add email support

Adds Resend integration.

Closes #456"
```

## Running Release Commands

### Prepare Release
```bash
npm run release:prepare
```
Analyzes commits since last tag and suggests version bump.

### Preview Changelog
```bash
npm run release:draft
```
Shows what will be added to CHANGELOG.md.

### Create Release
```bash
npm run release:tag
```
1. Updates CHANGELOG.md
2. Updates package.json version
3. Creates commit and tag
4. Prints next steps

### Finalize (Push)
```bash
git push origin main
git push origin v0.2.0
```

## CI Validation

### On Pull Requests
- ✅ Commitlint: Validates conventional commit format
- ✅ ESLint: Zero warnings
- ✅ TypeScript: No type errors
- ✅ Tests: All passing

### On Tag Push
- ✅ GitHub Actions: Creates release from CHANGELOG.md

## Key Rules

1. **Commit format is mandatory** — All commits must follow `type(scope): description`
2. **Squash merge to main** — Keep main branch clean with one commit per feature
3. **Tag from main** — Never release from feature branches
4. **CHANGELOG.md is canonical** — Release notes come from this file
5. **Pre-releases supported** — Can create v1.0.0-alpha.1, v1.0.0-beta.1, v1.0.0-rc.1

## Troubleshooting

### Commitlint fails on PR
Commits don't follow format.
```bash
git rebase -i origin/main
# Edit commits to follow "type(scope): description"
git push --force-with-lease
```

### Need to redo release
Delete local and remote tag:
```bash
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
npm run release:prepare
npm run release:tag
```

### No changes to release
Only `chore`, `ci`, `style`, `test` commits since last tag.
Need at least one `feat:` or `fix:` commit.

## Standards Followed

- **Semantic Versioning 2.0.0** — https://semver.org/
- **Conventional Commits 1.0.0** — https://www.conventionalcommits.org/
- **Keep a Changelog** — https://keepachangelog.com/

## Next Steps

1. ✅ Commit release setup to main branch
2. ✅ Create first release with `npm run release:tag`
3. ✅ Tag and push to GitHub
4. ✅ Verify GitHub Release is created automatically
5. ✅ Update CI/CD pipeline to use releases (deployment-manager)

## Related Documentation

- [RELEASE.md](RELEASE.md) — Detailed release process
- [docs/release-engineering.md](docs/release-engineering.md) — Setup guide
- [CHANGELOG.md](CHANGELOG.md) — Project changelog
- [.commitlintrc.json](.commitlintrc.json) — Validation rules

---

**Setup completed on**: 2026-04-09
**Initial version**: 0.1.0
**Suggested next release**: 0.2.0
