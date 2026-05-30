# E2E Testing Plan — Intelligence Exchange

## Application Status

**Current State**: Infrastructure running, broker on port 3001, web app on port 3100

- ✅ Docker infrastructure (Postgres, Redis) - running
- ✅ Broker API - running on http://localhost:3001
- ✅ Web app - running on http://localhost:3100

## Test Execution Results

**Date**: 2026-05-30
**Browser**: Chromium (Headed)
**Test Framework**: Playwright 1.59.1
**Total Tests**: 12
**Passed**: 12 ✅
**Failed**: 0
**Duration**: 9.7s

### Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| Landing page loads | ✅ PASS | Page renders successfully |
| Navigation to Ideas board | ✅ PASS | Navigation works correctly |
| Navigation to Jobs board | ✅ PASS | Navigation works correctly |
| Navigation to Agents page | ✅ PASS | Navigation works correctly |
| Ideas board renders | ✅ PASS | No rendering issues |
| Jobs board renders | ✅ PASS | No rendering issues |
| Agents page renders | ✅ PASS | No rendering issues |
| Console errors - Landing page | ✅ PASS | No console errors |
| Console errors - Ideas board | ✅ PASS | No console errors |
| Console errors - Jobs board | ✅ PASS | No console errors |
| Console errors - Agents page | ✅ PASS | No console errors |
| 404 handling - invalid route | ✅ PASS | Handles gracefully |

## Quick Start

```bash
# Start infrastructure
docker compose up -d

# Start broker (terminal 1)
cd apps/intelligence-exchange-cannes-broker
source ~/.nvm/nvm.sh && nvm use 22
export PATH="$HOME/.bun/bin:$PATH"
bun run src/index.ts

# Start web app (terminal 2)
cd apps/intelligence-exchange-cannes-web
source ~/.nvm/nvm.sh && nvm use 22
pnpm dev

# Access application
# Web: http://localhost:3100
# API: http://localhost:3001
```

## Automated E2E Tests

**Location**: `apps/intelligence-exchange-cannes-web/e2e/basic.spec.ts`
**Framework**: Playwright 1.59.1

### Run All Tests

```bash
cd apps/intelligence-exchange-cannes-web
source ~/.nvm/nvm.sh && nvm use 22
npx playwright test
```

### Run Specific Browser

```bash
# Chromium
npx playwright test --project=chromium

# Firefox
npx playwright test --project=firefox

# WebKit (Safari)
npx playwright test --project=webkit
```

### Run with Headed Browser (Watch Execution)

```bash
npx playwright test --project=chromium --headed
```

### Run in Debug Mode

```bash
npx playwright test --debug
```

### View Test Report

```bash
npx playwright show-report
```

### Test Coverage

Current automated tests cover:
- ✅ Page rendering for all main routes
- ✅ Navigation between pages
- ✅ Console error detection
- ✅ 404 handling

### Manual Testing Checklist

For flows not yet automated, use the manual checklists below.

## Test Flows

### Flow 1: Landing Page (Unauthenticated)

**URL**: http://localhost:3100

**States to Test**:
1. Initial load - verify page renders
2. Navigation to Ideas board
3. Navigation to Jobs board
4. Navigation to Agents page
5. Wallet connection button state (disconnected)

**Expected Behavior**:
- Hero section with value proposition
- Navigation menu visible
- Call-to-action buttons working
- No 404s or console errors

**Checklist**:
- [ ] Page loads without errors
- [ ] All navigation links work
- [ ] Hero content displays correctly
- [ ] Wallet connect button visible and clickable
- [ ] Responsive design (mobile/desktop)

---

### Flow 2: Ideas Board (Unauthenticated)

**URL**: http://localhost:3100/ideas

**States to Test**:
1. Empty state (no ideas)
2. With ideas populated
3. Filtering by status
4. Search functionality
5. Pagination

**Expected Behavior**:
- Ideas list displays
- Filter controls work
- Search returns results
- Each idea card shows: title, description, status, submitter, timestamp

**Checklist**:
- [ ] Ideas list renders
- [ ] Filter controls functional
- [ ] Search works
- [ ] Idea cards display all metadata
- [ ] Status badges correct (Draft, Published, Accepted, Rejected)
- [ ] Clicking idea navigates to detail view

---

### Flow 3: Jobs Board (Unauthenticated)

**URL**: http://localhost:3100/jobs

**States to Test**:
1. Empty state (no jobs)
2. With jobs populated
3. Filtering by status (Open, Claimed, In Progress, Completed)
4. Filtering by skill category
5. Search by job title/description

**Expected Behavior**:
- Jobs list displays
- Filters work independently and combined
- Status-driven left border colors match DESIGN.md
- Job cards show: title, description, reward, deadline, status

**Checklist**:
- [ ] Jobs list renders
- [ ] Status filters work
- [ ] Skill filters work
- [ ] Search functionality works
- [ ] Status badges correct (Open=green, Claimed=blue, In Progress=amber, Completed=gray)
- [ ] Left border colors semantic (2px, status-driven)
- [ ] Job cards have proper border (1px, border-border)
- [ ] Cards use rounded-md (8px)

---

### Flow 4: Agents Page (Unauthenticated)

**URL**: http://localhost:3100/agents

**States to Test**:
1. Empty state (no registered agents)
2. With agents populated
3. Filtering by role (Builder, Reviewer, Validator)
4. Search by agent name/address
5. Sort by reputation, completed jobs

**Expected Behavior**:
- Agent list displays
- Filters work
- Agent cards show: name, role, reputation, completed jobs, verification status

**Checklist**:
- [ ] Agents list renders
- [ ] Role filters work
- [ ] Search works
- [ ] Sorting works
- [ ] Agent cards display all metadata
- [ ] Verification badges display (World ID, GitHub, etc.)

---

### Flow 5: Idea Submission (Authenticated)

**Prerequisites**: Wallet connected

**URL**: http://localhost:3100/ideas/new

**States to Test**:
1. Form validation (empty fields)
2. Valid submission
3. Draft saving
4. Edit existing draft
5. Submit for review

**Expected Behavior**:
- Form validates required fields
- Draft saves to local storage or API
- Submit creates idea record
- Status updates to "Submitted"
- Redirects to ideas board or detail view

**Checklist**:
- [ ] Form renders all fields (title, description, category, tags)
- [ ] Validation works (required fields, length limits)
- [ ] Draft save functionality works
- [ ] Submit creates idea successfully
- [ ] Status updates correctly
- [ ] Redirect after submission works
- [ ] Error handling for API failures

---

### Flow 6: Job Claiming (Authenticated)

**Prerequisites**: Wallet connected, agent registered

**URL**: http://localhost:3100/jobs/{jobId}

**States to Test**:
1. View job details
2. Claim job (first claim)
3. Claim job (already claimed)
4. Unclaim job
5. Submit work

**Expected Behavior**:
- Job details display full information
- Claim button shows for open jobs
- Claim updates status to "Claimed"
- Unclaim returns job to "Open"
- Submit work form appears for claimed jobs
- Submission updates status to "In Review"

**Checklist**:
- [ ] Job detail page renders
- [ ] All job metadata displays
- [ ] Claim button works for open jobs
- [ ] Status updates to "Claimed"
- [ ] Cannot claim already claimed jobs
- [ ] Unclaim works
- [ ] Submit work form renders
- [ ] Submission form validates
- [ ] Submission updates status
- [ ] Error handling for API failures

---

### Flow 7: Work Submission (Authenticated)

**Prerequisites**: Job claimed

**URL**: http://localhost:3100/jobs/{jobId}/submit

**States to Test**:
1. Form validation
2. File upload (if applicable)
3. Text submission
4. Link submission
5. Draft saving

**Expected Behavior**:
- Form validates required fields
- File uploads work (size limits, type validation)
- Text submissions accept markdown
- Link submissions validate URLs
- Draft saves work

**Checklist**:
- [ ] Submission form renders
- [ ] All input types work (text, file, link)
- [ ] File upload validates size/type
- [ ] Markdown preview works
- [ ] URL validation works
- [ ] Draft save works
- [ ] Submit creates submission record
- [ ] Status updates to "In Review"
- [ ] Error handling

---

### Flow 8: Review Flow (Authenticated - Reviewer Role)

**Prerequisites**: Reviewer role, submission in review

**URL**: http://localhost:3100/submissions/{submissionId}

**States to Test**:
1. View submission
2. Approve submission
3. Reject submission with feedback
4. Request changes
5. Complete job

**Expected Behavior**:
- Submission displays work
- Review controls visible to reviewers
- Approve updates status to "Approved"
- Reject requires feedback
- Request changes updates status to "Changes Requested"
- Complete updates job to "Completed"

**Checklist**:
- [ ] Submission displays correctly
- [ ] Review controls work
- [ ] Approve works
- [ ] Reject requires feedback
- [ ] Request changes works
- [ ] Complete job works
- [ ] Status updates propagate
- [ ] Notifications sent (if implemented)
- [ ] Error handling

---

### Flow 9: Wallet Connection

**States to Test**:
1. Connect wallet button
2. Wallet selection (MetaMask, etc.)
3. Connection success
4. Connection failure
5. Disconnect wallet
6. Reconnect wallet

**Expected Behavior**:
- Connect button opens wallet selection
- Successful connection updates UI
- Address displays correctly (truncated)
- Disconnect button appears
- State persists across page navigation

**Checklist**:
- [ ] Connect button works
- [ ] Wallet selection dialog opens
- [ ] Connection updates UI state
- [ ] Address displays correctly
- [ ] Disconnect works
- [ ] State persists on refresh
- [ ] Error handling for rejected connections

---

### Flow 10: World ID Verification (Optional)

**States to Test**:
1. Verify with World ID
2. Verification success
3. Verification failure
4. Skip verification (if WORLD_ID_STRICT=false)

**Expected Behavior**:
- World ID widget loads
- Verification succeeds with valid proof
- Verification fails gracefully
- Skip option available if not strict

**Checklist**:
- [ ] World ID widget loads
- [ ] Verification flow works
- [ ] Success updates profile
- [ ] Failure shows error message
- [ ] Skip option works (if configured)
- [ ] Error handling

---

## Edge Cases to Test

### Error States
- [ ] Network errors (simulate offline)
- [ ] API timeouts
- [ ] Invalid data responses
- [ ] Concurrent modifications (two users claiming same job)
- [ ] Rate limiting (if implemented)

### Boundary Conditions
- [ ] Very long text inputs
- [ ] Very large file uploads
- [ ] Unicode characters in inputs
- [ ] Special characters in URLs
- [ ] Empty lists (no ideas, no jobs, no agents)

### Browser Compatibility
- [ ] Chrome/Brave
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

### Responsive Design
- [ ] Mobile (375px width)
- [ ] Tablet (768px width)
- [ ] Desktop (1920px width)
- [ ] Ultra-wide (2560px width)

---

## API Endpoint Testing

### Ideas API
```bash
# List ideas
curl http://localhost:3001/v1/ideas

# Create idea (authenticated)
curl -X POST http://localhost:3001/v1/ideas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"Test","description":"Test"}'

# Get idea by ID
curl http://localhost:3001/v1/ideas/{id}

# Update idea
curl -X PUT http://localhost:3001/v1/ideas/{id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"status":"published"}'
```

### Jobs API
```bash
# List jobs
curl http://localhost:3001/v1/jobs

# Get job by ID
curl http://localhost:3001/v1/jobs/{id}

# Claim job (authenticated)
curl -X POST http://localhost:3001/v1/jobs/{id}/claim \
  -H "Authorization: Bearer <token>"

# Submit work
curl -X POST http://localhost:3001/v1/jobs/{id}/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"submission":"Work output"}'
```

### Agents API
```bash
# List agents
curl http://localhost:3001/v1/agents

# Get agent by ID
curl http://localhost:3001/v1/agents/{id}

# Register agent (authenticated)
curl -X POST http://localhost:3001/v1/agents/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"role":"builder","name":"Test Agent"}'
```

---

## Known Issues

### Resolved ✅
- ✅ Web app background process - now runs with manual terminal start or pnpm dev
- ✅ Browser automation - Playwright tests now working
- ✅ Basic E2E coverage - 12 tests passing

### Current Limitations
1. Web app requires manual terminal start (no process manager)
2. Only basic page rendering/navigation tests automated
3. Advanced flows (idea submission, job claiming, wallet connection) not yet automated
4. API health check endpoint not implemented (404 on root)

### To Fix
1. Implement advanced E2E tests for:
   - Wallet connection flows
   - Idea submission with form validation
   - Job claiming and submission
   - Review and completion flows
   - World ID verification
2. Set up process manager (PM2) for production
3. Add health check endpoint to broker
4. Add proper error pages (404, 500) with custom UI

---

## Test Data

### Seed Data Script
```bash
# Run seed script to populate test data
cd apps/intelligence-exchange-cannes-broker
bun run src/scripts/seed.ts
```

### Sample Data Needed
- 5-10 ideas in various states
- 10-20 jobs in various states
- 5-10 registered agents
- Test wallets for different roles

---

## Success Criteria

### Automated Tests (Current Status: ✅ PASS)
- ✅ No 404 errors on main route navigation
- ✅ No console errors on any page
- ✅ All pages render correctly
- ✅ Navigation between pages works
- ✅ 404 handling works

### Manual Testing (Pending)
- [ ] All forms validate correctly
- [ ] All API calls succeed
- [ ] State updates reflect in UI
- [ ] Responsive design works
- [ ] Error handling is graceful
- [ ] Design system compliance (DESIGN.md)

---

## Next Steps

### Completed ✅
1. ✅ Set up Playwright E2E testing framework
2. ✅ Implement basic page rendering tests
3. ✅ Implement navigation tests
4. ✅ Implement console error detection
5. ✅ Run tests in Chromium browser - all 12 passing

### In Progress
1. ⏳ Add advanced flow tests (wallet, forms, submissions)
2. ⏳ Add cross-browser testing (Firefox, Safari)
3. ⏳ Add responsive design tests

### To Do
1. Implement wallet connection E2E tests
2. Implement idea submission flow tests
3. Implement job claiming and submission tests
4. Implement review flow tests
5. Add visual regression testing
6. Integrate E2E tests into CI/CD pipeline
7. Add test data seeding script
8. Implement proper error pages (404, 500)