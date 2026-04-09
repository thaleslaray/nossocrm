# Release Process — NossoCRM

This document describes the release workflow for NossoCRM, from commit to GitHub Release.

## Overview

Release engineering for NossoCRM follows **semantic versioning** (MAJOR.MINOR.PATCH) with **conventional commits** for automated changelog generation.

- **Semantic Versioning**: https://semver.org/
- **Conventional Commits**: https://www.conventionalcommits.org/
- **Keep a Changelog**: https://keepachangelog.com/

## Version Strategy

NossoCRM uses `0.x.y` versioning during active development:

| Version | Status | Notes |
|---------|--------|-------|
| 0.1.x | Current MVP | Messaging + AI Agent |
| 0.2.x | Q2 2026 | Public REST API |
| 1.0.0 | Future | Stable APIs + GA |

**Release to 1.0.0 when:**
- Messaging APIs stabilized (Meta, Evolution, Email, Telegram)
- AI Agent HITL workflow proven in production
- Public REST/GraphQL APIs documented and tested
- Security audit completed

## Workflow

### 1. Develop Features (Normal Workflow)

Push to `feature/*` branches with conventional commits:

```bash
git checkout -b feature/add-api-v2
git commit -m "feat(api): add v2 REST endpoints for deals"
git push origin feature/add-api-v2
```

**Commit Format**:
```
type(scope): description

[optional body]
[optional: BREAKING CHANGE: description]
```

**Types** (from `.commitlintrc.json`):
- `feat`: New feature → **MINOR** version bump
- `fix`: Bug fix → **PATCH** version bump
- `feat!`: Breaking change → **MAJOR** version bump
- `refactor`: Code reorganization (no new features)
- `docs`: Documentation only
- `chore`: Maintenance, dependencies
- `ci`: CI/CD configuration
- `test`: Test additions/fixes
- `perf`: Performance improvements
- `style`: Code style (formatting, semicolons)

### 2. Create Pull Request

On GitHub, open a PR against `main`:

```bash
gh pr create --title "feat: Add public API v2" --body "..."
```

**Required checks**:
- ✅ Commitlint (validates conventional format)
- ✅ Lint (ESLint zero warnings)
- ✅ Tests (Vitest all passing)
- ✅ Typecheck (tsc --noEmit)

### 3. Merge to Main

After review and approval, **squash + merge** to `main`:

```bash
gh pr merge 123 --squash
```

This ensures a clean history with one commit per feature.

### 4. Prepare Release

When ready to release, analyze commits since last tag:

```bash
npm run release:prepare
```

Output:
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

### 5. Preview Changelog

Review what will be released:

```bash
npm run release:draft
```

Output:
```
📋 Changelog Preview for v0.2.0

## [0.2.0] - 2026-04-15

### Added
- feat(api): add v2 REST endpoints for deals
- feat(messaging): support Telegram thread replies
- feat(ai): add few-shot learning for sales qualification

### Fixed
- fix(webhook): handle concurrent message processing
- fix(email): fix bounce event parsing

### Changed
- refactor(auth): simplify session management
- refactor(db): optimize deal query indexes

This will be prepended to CHANGELOG.md
Run "npm run release:tag" to create the release
```

### 6. Create Release

When satisfied with the changelog:

```bash
npm run release:tag
```

This:
1. ✅ Updates `CHANGELOG.md` with new version section
2. ✅ Updates `package.json` version
3. ✅ Commits changes (`chore(release): vX.Y.Z`)
4. ✅ Creates annotated git tag
5. 📋 Prints next steps

Output:
```
✅ Created tag v0.2.0

Next steps:
  git push origin main
  git push origin v0.2.0

GitHub Actions will create the release automatically.
```

### 7. Trigger GitHub Release

Push the tag to GitHub:

```bash
git push origin main
git push origin v0.2.0
```

The `.github/workflows/release.yml` workflow automatically:
1. Extracts version from tag
2. Finds previous release
3. Reads changelog section from `CHANGELOG.md`
4. Creates GitHub Release with formatted notes
5. Links to full diff

## GitHub Release Output

Example release on GitHub:

```
# Release 0.2.0

## [0.2.0] - 2026-04-15

### Added
- feat(api): add v2 REST endpoints for deals
- feat(messaging): support Telegram thread replies

### Fixed
- fix(webhook): handle concurrent message processing

---

**Full Diff**: [v0.1.0...v0.2.0](https://github.com/thaleslaray/nossocrm/compare/v0.1.0...v0.2.0)
```

## Key Files

| File | Purpose |
|------|---------|
| `CHANGELOG.md` | Manually maintained changelog in "Keep a Changelog" format |
| `package.json` | Version source of truth |
| `.commitlintrc.json` | Conventional commit validation rules |
| `scripts/release.mjs` | Release automation script |
| `.github/workflows/ci.yml` | Commitlint validation on PRs |
| `.github/workflows/release.yml` | GitHub Release creation on tag push |

## CI Validation

### On Pull Request
- ✅ **Commitlint**: Validates all commits follow conventional format
- ✅ **Lint**: ESLint with zero warnings
- ✅ **Tests**: Vitest all passing
- ✅ **Typecheck**: TypeScript compilation

### On Tag Push
- ✅ **GitHub Release**: Auto-creates release from CHANGELOG.md

## Pre-release Workflow (Alpha/Beta)

For early testing, create pre-release tags:

```bash
# Create alpha tag (does not update latest)
git tag -a v0.2.0-alpha.1 -m "Release 0.2.0-alpha.1"
git push origin v0.2.0-alpha.1

# Later: create beta when stabilized
git tag -a v0.2.0-beta.1 -m "Release 0.2.0-beta.1"
git push origin v0.2.0-beta.1

# Finally: create release candidate
git tag -a v0.2.0-rc.1 -m "Release 0.2.0-rc.1"
git push origin v0.2.0-rc.1

# Then: final release
npm run release:tag  # Creates v0.2.0
```

The release workflow automatically marks pre-releases (contains `alpha`, `beta`, `rc`) as pre-releases on GitHub.

## Hotfixes

For urgent fixes to production (if deployed):

```bash
git checkout -b fix/urgent-bug-in-v0.1.0
git commit -m "fix: Critical fix for issue #456"
git push origin fix/urgent-bug-in-v0.1.0

# Create PR against main
gh pr create --title "fix: Critical security patch"

# Merge to main
gh pr merge 789 --squash

# Now release patch version
npm run release:prepare    # → suggests 0.1.1
npm run release:draft
npm run release:tag
git push origin main
git push origin v0.1.1
```

## Troubleshooting

### "No changes to release"

All commits since last tag are `chore`, `ci`, `style`, or `test` (no features or fixes).

**Solution**: Features must be commits with `feat:` or `fix:` prefix.

### Commitlint validation fails on PR

Commits don't follow conventional format (e.g., "Fixed login bug" instead of "fix: login bug").

**Solution**: Rebase and amend commits to follow format:
```bash
git rebase -i origin/main
# Edit commits to follow "type(scope): description"
git push --force-with-lease
```

### Tag already exists

A tag with that version is already pushed.

**Solution**: Create a new patch version:
```bash
npm run release:prepare  # Check next suggested version
npm run release:draft
npm run release:tag
```

### Need to update CHANGELOG.md manually

For major releases or special cases, edit `CHANGELOG.md` directly before tagging:

```bash
# Edit CHANGELOG.md by hand
git add CHANGELOG.md
git commit -m "chore: Update changelog for v1.0.0"
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

## Best Practices

1. **Commit often**: Small commits are easier to review and revert
2. **Use conventional format**: Enables automation and clear history
3. **Link to issues**: Use `Closes #123` in PR/commit bodies
4. **Test before release**: Run `npm run precheck` locally
5. **Update CHANGELOG.md**: Keep "Unreleased" section current
6. **Tag from main**: Releases should only come from main branch
7. **Create release notes**: Use GitHub UI to add deployment notes
8. **Archive old releases**: Close old milestones, keep one active

## Related Documentation

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Release API](https://docs.github.com/en/rest/releases/releases)
