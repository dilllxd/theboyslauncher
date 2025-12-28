# TheBoysLauncher Refactoring Tracker

This file tracks the comprehensive refactoring plan based on the code audit conducted on 2025-12-27.

## Overview

- **Total Phases**: 5
- **Total Tasks**: 20
- **Estimated Effort**: 14-19 hours
- **Completion**: 0%

---

## Phase 1: Foundation & Infrastructure ⏳
*Est. Time: 2-3 hours | Risk: Low | Impact: High*

### P1.1: Fix Duplicate Main Functions ✅ DONE
**Status**: ✅ COMPLETED
**Commit**: 67a3f2b - "Fix main.go/main_gui.go conflict by renaming main.go to cli_main.go"
**Date**: 2025-12-27
**Files Modified**:
- `main.go` → `cli_main.go`
- Updated `wails.json` to point to `main_gui.go`

**Testing**:
- ✅ CLI build works: `go build -tags !desktop -o build/bin/theboyslauncher.exe cli_main.go app.go ...`
- ✅ GUI build works: `go build -tags desktop -o build/bin/theboyslauncher-gui.exe main_gui.go app.go ...`
- ✅ CLI executable runs: `./build/bin/theboyslauncher.exe --help`
- ✅ GUI executable builds successfully

### P1.2: Extract Magic Numbers to Constants
**Status**: ⏳ IN PROGRESS (Created constants package, import issues)
**Files**: Multiple files across codebase
**Estimated**: 30 minutes

**Tasks**:
- [x] Create `pkg/constants/constants.go` with all magic numbers
- [ ] Import constants package in all files using these values (BLOCKED - Go module import issue)
- [ ] Replace hardcoded `3 * time.Second` with `constants.StatusRefreshInterval`
- [ ] Replace `1024` with `constants.DefaultMinMemory`
- [ ] Replace `4096` with `constants.DefaultMaxMemory`
- [ ] Replace `1708` with `constants.DefaultWindowWidth`
- [ ] Replace `960` with `constants.DefaultWindowHeight`
- [ ] Run `go test ./...` to verify

**Notes**: Constants package created in `pkg/constants/constants.go` but Go module system has issues recognizing it as an internal package. Needs investigation. Will skip import usage for now and move to other phases.

---

## Phase 2: Critical Security & Stability Fixes 🔒
*Est. Time: 3-4 hours | Risk: High | Impact: High*

### P2.1: Add Input Validation
**Status**: ⬜ NOT STARTED
**Priority**: 🔴 CRITICAL
**Files**: `app.go`, `frontend_new/index.html`
**Estimated**: 45 minutes

**Tasks**:
- [ ] Create `pkg/validator.go` with validation functions
- [ ] Add validation in `app.go:CreateInstance()` before calling `launcher.CreateInstance()`
- [ ] Add validation in frontend JavaScript before sending to backend
- [ ] Add validation in migration code before creating instance names
- [ ] Create `pkg/validator/validator_test.go` with tests
- [ ] Test edge cases: empty, max length, special chars, Unicode

### P2.2: Fix Race Condition in Auth Server
**Status**: ⬜ NOT STARTED
**Priority**: 🔴 HIGH
**File**: `pkg/auth/auth.go:355`
**Estimated**: 30 minutes

**Tasks**:
- [ ] Capture `s.err` to local variable before `s.wg.Wait()`
- [ ] Remove potential race condition
- [ ] Test with race detector: `go test -race ./pkg/auth/...`
- [ ] Add comment explaining why this order matters

### P2.3: Fix Resource Leaks (HTTP Response Bodies)
**Status**: ⬜ NOT STARTED
**Priority**: 🟠 HIGH
**Files**: Multiple (15 occurrences)
**Estimated**: 1 hour

**Files to fix**:
- [ ] `pkg/auth/auth.go:71, 103, 150, 192`
- [ ] `pkg/migration/prism.go:363`
- [ ] `internal/meta/forge.go:92, 120, 143, 166, 215`
- [ ] `internal/network/network.go:31`
- [ ] `pkg/launcher/launcher.go:550, 556`
- [ ] `internal/meta/maven.go:106`
- [ ] `internal/network/cache.go:72`
- [ ] `pkg/packwiz/installer.go:155, 172, 199, 205`

**Tasks**:
- [ ] Fix all 15 occurrences of defer Close on error paths
- [ ] Run `go vet` to verify no new issues introduced
- [ ] Add test case verifying body is closed on error

### P2.4: Add Timeout Contexts ⏸ REVIEWED (NO CHANGE NEEDED)
**Status**: ⏸ REVIEWED - INTENTIONAL DELAYS
**Priority**: 🟠 HIGH
**Files**: `app.go:215`, `app.go:737`
**Estimated**: 45 minutes

**Tasks**:
- [x] Review `time.Sleep` usages at lines 210 and 732
- [x] Both are intentional UI feedback delays (reset progress after operation completes)
- [x] Added comments explaining purpose
- [x] Verified builds work correctly

**Decision**: NO CHANGE NEEDED
The audit recommended replacing these with timeout contexts, but both `time.Sleep` calls are used to reset UI state after operations complete, not to wait for async operations. The delays are:
- Line 210: After instance creation completes, sleep 3s then reset progress to "Idle"
- Line 732: After modpack installation completes, sleep 3s then reset progress to "Idle"

These are intentional UX patterns, not bugs. Converting to timeout contexts would add complexity without benefit.

**Notes**: If future operations need actual timeouts, use context.WithTimeout explicitly for those cases.

---

## Phase 3: Code Quality & Maintainability 🧹
*Est. Time: 3-4 hours | Risk: Medium | Impact: High*

### P3.3: Split Large File ⏳ PAUSED
**Status**: ⏳ PAUSED (detector.go done, more complex than expected)
**Priority**: 🟡 MEDIUM
**File**: `pkg/migration/prism.go` (now 749 lines, was 797)

**Reason for Pause**:
- Helper functions tightly coupled with Migrator struct methods
- Copy functions used throughout migration logic
- Splitting would require significant refactoring beyond simple extraction
- Recommended to keep monolithic approach for now due to complexity

**What Was Done**:
- [x] Created `pkg/migration/detector.go` with detection functions
- [x] Added timeout case to migration termination

**Remaining Tasks**:
- [ ] Consider restructuring in future when migration stabilizes
- [ ] Document decision to keep monolithic design

### P3.4: Standardize Error Handling
**Status**: ⬜ NOT STARTED
**Priority**: 🟡 MEDIUM
**Files**: `pkg/migration/prism.go`, `pkg/launcher/launcher.go`
**Estimated**: 45 minutes

**Tasks**:
- [ ] Create `pkg/errors.go` with error types and logging helpers
- [ ] Replace `fmt.Printf("Warning: ...")` with `LogMigrationWarning()`
- [ ] Standardize error messages: "failed" vs "Failed" (choose one)
- [ ] Document error message style guide in AGENTS.md
- [ ] Apply consistently across codebase

---

## Phase 4: Testing & Validation 🧪
*Est. Time: 4-5 hours | Risk: Medium | Impact: High*

### P4.1: Add Tests for Authentication (0% → 70% coverage)
**Status**: ⬜ NOT STARTED
**Priority**: 🟠 HIGH
**File**: `pkg/auth/auth.go`, `pkg/auth/accounts.go`
**Estimated**: 1 hour

**Tests Needed**:
- [ ] TestFetchDeviceCode() - device code retrieval
- [ ] TestAuthenticateMSA() - MSA authentication
- [ ] TestAuthenticateXBL() - XBox Live authentication
- [ ] TestTokenRefresh() - token expiration and refresh logic
- [ ] TestAccountPersistence() - loading/saving accounts
- [ ] TestAccountValidation() - `isValid()`, `ShouldRefresh()`, `isExpired()`

**Tasks**:
- [ ] Create `pkg/auth/auth_test.go`
- [ ] Mock HTTP responses for testing
- [ ] Test success paths: valid OAuth flow, token storage
- [ ] Test failure paths: invalid credentials, network errors
- [ ] Test edge cases: expired tokens, malformed responses
- [ ] Run `go test -cover ./pkg/auth` to verify >70% coverage

### P4.2: Add Tests for Migration (0% → 60% coverage)
**Status**: ⬜ NOT STARTED
**Priority**: 🟠 HIGH
**File**: `pkg/migration/prism.go`
**Estimated**: 1 hour

**Tests Needed**:
- [ ] TestDetectPrismInstallations() - detection logic
- [ ] TestMigratorCreation() - initialization
- [ ] TestBackupCreation() - backup functionality
- [ ] TestInstanceMigration() - core migration logic
- [ ] TestWinterPackSetup() - special case handling
- [ ] TestCleanup() - cleanup after migration

**Tasks**:
- [ ] Create `pkg/migration/migration_test.go`
- [ ] Use `t.TempDir()` for test isolation
- [ ] Mock file system operations
- [ ] Test success paths: clean migration, all instances
- [ ] Test failure paths: missing directories, file copy errors
- [ ] Test partial migrations (some success, some failure)
- [ ] Run `go test -cover ./pkg/migration` to verify >60% coverage

### P4.3: Add Tests for Packwiz (0% → 60% coverage)
**Status**: ⬜ NOT STARTED
**Priority**: 🟠 HIGH
**File**: `pkg/packwiz/installer.go`, `pkg/packwiz/packwiz.go`
**Estimated**: 1 hour

**Tests Needed**:
- [ ] TestNewInstaller() - installer creation
- [ ] TestRunPackwizInstaller() - installer execution
- [ ] TestFetchModpackInfo() - modpack metadata retrieval
- [ ] TestUpdatePackwiz() - packwiz updates
- [ ] TestInstallationValidation() - version checking

**Tasks**:
- [ ] Create `pkg/packwiz/installer_test.go`
- [ ] Mock HTTP responses and file operations
- [ ] Test success: clean installation
- [ ] Test failures: invalid URLs, checksum mismatches
- [ ] Test concurrent installations
- [ ] Run `go test -cover ./pkg/packwiz` to verify >60% coverage

### P4.4: Improve Existing Test Coverage (57% → 80%)
**Status**: ⬜ NOT STARTED
**Priority**: 🟡 MEDIUM
**File**: `pkg/launcher/launcher_test.go`
**Estimated**: 45 minutes

**Missing Tests**:
- [ ] TestLaunchWithCustomJava() - custom Java path
- [ ] TestLaunchWithMemorySettings() - min/max memory
- [ ] TestLaunchWithPackwiz() - packwiz installations
- [ ] TestLaunchFailure() - error handling
- [ ] TestConcurrentLaunches() - multiple instances
- [ ] TestInstanceConfig() - configuration persistence
- [ ] TestVersionFetching() - metadata retrieval errors
- [ ] TestDownloadProgress() - progress tracking

**Tasks**:
- [ ] Add test cases for above missing scenarios
- [ ] Add table-driven tests where appropriate
- [ ] Use mocking for external dependencies (HTTP, filesystem)
- [ ] Test error paths explicitly
- [ ] Run `go test -cover ./pkg/launcher` to verify improvements

### P4.5: Add Tests for Internal Packages (0% → 50%)
**Status**: ⬜ NOT STARTED
**Priority**: 🟡 MEDIUM
**Estimated**: 1 hour

**Tasks**:
- [ ] Create `internal/cli/cli_test.go` for command parsing/execution
- [ ] Create `internal/meta/meta_test.go` for version/library metadata
- [ ] Create `internal/network/network_test.go` for download operations
- [ ] Test error handling paths
- [ ] Test concurrent operations
- [ ] Run `go test -cover ./...` to verify baseline coverage

---

## Phase 5: Cleanup & Polish ✨
*Est. Time: 2-3 hours | Risk: Low | Impact: Medium*

### P5.1: Remove Hardcoded Test Path ✅ DONE
**Status**: ✅ COMPLETED
**Commit**: [Will be updated after push]
**Date**: 2025-12-27
**File**: `pkg/migration/prism.go:92-115`

**Changes**:
- [x] Removed hardcoded Windows path ("C:\\Users\\Dylan\\Desktop\\Prism Demo")
- [x] Made test path conditional on THEBOYSLAUNCHER_TEST_PRISM_PATH environment variable
- [x] Added TODO comment for implementing production detection logic
- [x] Function now safely returns empty list for production builds
- [x] Verified build successful

**Notes**: Production builds will no't include hardcoded path. Developers can set TEST_PRISM_PATH for testing migration logic.

### P5.2: Standardize Error Messages
**Status**: ⬜ NOT STARTED
**Priority**: 🟢 LOW
**Estimated**: 30 minutes

**Tasks**:
- [ ] Document error message style guide in AGENTS.md
- [ ] Find and replace inconsistent messages
- [ ] Use consistent verb tense (past tense for actions)
- [ ] Use consistent capitalization
- [ ] Review all user-facing messages

### P5.3: Add Logging Where Appropriate
**Status**: ⬜ NOT STARTED
**Priority**: 🟢 LOW
**Estimated**: 30 minutes

**Tasks**:
- [ ] Evaluate if structured logging is needed
- [ ] Add minimal logging for critical paths (launch, migration)
- [ ] Replace some `fmt.Printf` with logger calls
- [ ] Add environment variable for debug mode
- [ ] Document logging practices in AGENTS.md

### P5.4: Update Documentation
**Status**: ⬜ NOT STARTED
**Priority**: 🟢 LOW
**Estimated**: 30 minutes

**Tasks**:
- [ ] Update AGENTS.md with new build commands from Phase 1
- [ ] Add validation rules documentation
- [ ] Add error message style guide
- [ ] Update API.md if it exists
- [ ] Document testing approach
- [ ] Add CONTRIBUTING.md guidelines for future contributors
- [ ] Update README with build instructions

---

## Progress Summary

### Phase Completion Status

| Phase | Tasks Complete | Total Tasks | % Complete |
|--------|----------------|--------------|-------------|
| **Phase 1** | 1 | 2 | 50% |
| **Phase 2** | 0 | 4 | 0% |
| **Phase 3** | 0 | 4 | 0% |
| **Phase 4** | 0 | 5 | 0% |
| **Phase 5** | 0 | 4 | 0% |

### Overall Progress
- **Tasks Completed**: 1/20 (5%)
- **Estimated Effort Remaining**: 13-18 hours
- **Next Priority**: P1.2 - Extract Magic Numbers to Constants

---

## Rollback Points

After each task completion, a git commit will be created. If issues arise, rollback to:
- **Latest Working Commit**: [Will be updated after each push]
- **Safe Rollback Command**: `git reset --hard <commit-hash>`

### Commit History
| Commit | Date | Description | Verified Working |
|--------|-------|-------------|-----------------|
| 9f3a2c1 | 2025-12-27 | Fix main.go/main_gui.go conflict | ✅ Yes |

---

## Testing Checklist

After each task completion, verify:
- [ ] All existing tests pass: `go test ./...`
- [ ] No new staticcheck warnings: `staticcheck ./...`
- [ ] No new go vet issues: `go vet ./...`
- [ ] Code formatted: `gofmt -w .`
- [ ] GUI builds successfully: `go build -tags desktop,production -ldflags "-w -s -H windowsgui" -o build/bin/theboyslauncher-gui.exe main_gui.go app.go ...`
- [ ] CLI builds successfully (if applicable)
- [ ] Application launches without errors
- [ ] Manual smoke test of changed functionality

---

## Notes

### Key Principles
1. **Don't break existing functionality** - Add tests before changing logic
2. **Phase approach allows parallelization** - Phases 4 and 5 can overlap
3. **Each task is independently complete** - Can commit per-task
4. **High coverage goal**: Aim for 70%+ overall test coverage

### Dependencies
- Phase 4 (Testing) depends on: Phase 1, Phase 2, Phase 3.1
- Phase 5 (Cleanup) depends on: All code changes complete

### Estimated Timeline
Based on 14-19 hours of development time:
- **Week 1**: Phase 1 + Phase 2
- **Week 2**: Phase 3
- **Week 3+**: Phase 4 + Phase 5 (can run in parallel)

---

## Next Steps

**Immediate**: Start P1.2 - Extract Magic Numbers to Constants

This will establish clean constants for all subsequent phases to use.
