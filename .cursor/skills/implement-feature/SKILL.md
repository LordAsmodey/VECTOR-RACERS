---
name: implement-feature
description: Runs the full feature implementation workflow: design (Architect), plan creation (Planner), then execution per task (Worker → Reviewer) driven by the Orchestrator. The executing agent acts as Orchestrator (management only); it does not write code or the plan. Use when the user says "implement", "implement: <feature>", or requests to implement a feature end-to-end using project agents.
---

# Implement Feature — Full Workflow

This skill defines the end-to-end workflow for implementing a feature using project agents. The **executing agent** acts as **Orchestrator**: it coordinates subagents via `mcp_task`, decides who to call (Architect, Planner, Workers, Reviewers), and passes context between phases. It does **not** write code or create the implementation plan — the **Planner** creates the plan.

Important: **Orchestrator is the current executing agent** (the management logic). Do **not** try to run `mcp_task` with `subagent_type="orchestrator"`—`subagent_type` is only for Architect/Planner/Workers/Reviewers/Testers/`docs-writer`.

**Project: Vector Racers** — before orchestrating, ensure subagents have stack context: read **`.cursor/agents/vector-racers-context.md`** and **`vector-racers-tasks.md`**. Monorepo: **pnpm** + **Turborepo**; **`apps/web`** (Next.js App Router), **`apps/api`** (NestJS), **`packages/shared`**, **`packages/db`** (`@vector-racers/db` — only Prisma). Pass this context in prompts to Workers when tasks touch boundaries (no Prisma in `apps/web`).

---

## When to Apply

- User says **"implement"**, **"implement: &lt;feature description&gt;"**, or clearly requests to implement a feature using the agent pipeline.
- Do **not** apply for one-off edits, bugfixes without feature scope, or when the user only wants design or only wants a task list.

---

## High-Level Flow

The **Orchestrator** (you, the executing agent) only manages: you decide whom to call and what to pass. The **Planner** produces the task list and execution plan; you never write the plan yourself.

```
User: "implement: <feature>"
    │
    ▼
┌─────────────────┐
│ 1. ARCHITECT    │  (optional: Orchestrator decides; skip if trivial)
│    Design       │  → architecture design (JSON), constraints_for_orchestrator
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. PLANNER      │  Input: feature + (architecture or none)
│    Create plan  │  → tasks[], execution plan (assignee, scope, order)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 3. ORCHESTRATOR executes plan: FOR EACH TASK (in order)  │
│    ┌──────────────┐    ┌────────────────┐               │
│    │ WORKER       │ →  │ REVIEWER       │               │
│    │ (assignee)   │    │ (matching)     │               │
│    └──────┬───────┘    └───────┬────────┘               │
│           │  FAILED (≤3 tries) │  APPROVED               │
│           └────────────────────┘ → next task or done     │
│           │  FAILED (>3) → circuit breaker → user        │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 3.5 TEST PHASE (after all implementation tasks)          │
│    Testers: design test cases → write tests → run suite  │
│    frontend-tester → backend-tester → e2e-tester        │
│    If any FAILED: test_retry_count++; if < 3: rework     │
│    affected tasks (Worker → Reviewer) → testers again    │
│    Max 3 test retry cycles; then circuit breaker → user  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 3.6 DOCS PHASE (after test phase, before report)          │
│    docs-writer: create/update ADR, README, docs/         │
│    Input: feature summary, tasks, files changed,         │
│    test result, optional adr_candidate from Architect    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ 4. REPORT       │  Summarize: what was done, tests, docs, files changed, failures
│    to User      │
└─────────────────┘
```

---

## Agent Registry (Extensible)

Map task `assignee` from **Planner** output to `subagent_type` for `mcp_task`. The Orchestrator (you) calls Architect and Planner explicitly; for execution you use this table to dispatch Workers and Reviewers by assignee.

| assignee           | subagent_type     | Role                          |
|--------------------|-------------------|-------------------------------|
| frontend-worker    | frontend-worker   | Implement frontend task       |
| frontend-reviewer  | frontend-reviewer | Review frontend changes       |
| backend-worker     | backend-worker    | Implement backend task        |
| backend-reviewer   | backend-reviewer  | Review backend changes        |
| frontend-tester    | frontend-tester   | Design test cases, write frontend tests, run suite       |
| backend-tester     | backend-tester    | Design test cases, write backend tests, run suite        |
| e2e-tester         | e2e-tester        | Design E2E cases, write E2E tests, build + run            |
| —                  | docs-writer       | Create/update ADR, README, docs (after test phase) |
| architect          | architect         | Produce architecture design   |
| planner            | planner           | Create tasks + execution plan |

**Adding agents:** Define new assignees in Architect and Planner outputs (e.g. `test-runner`), add corresponding rows here and ensure those subagent types exist in the environment. Testers and docs-writer are invoked by the Orchestrator during the Test Phase and Docs Phase respectively, not by task assignee.

---

## Step-by-Step Instructions

### Step 0: Parse User Input

- Extract **feature description** from the user message (e.g. after "implement:" or from the last message).
- If the user indicates that **design is already ready** (e.g. "design is in `designs/onboarding-wizard/`" or "design folder: designs/checkout-flow"), capture the **design folder path** and pass it to the Planner and to frontend tasks so implementation matches the HTML/CSS in that folder.
- If the description is vague or too short, ask one clarifying question before starting (e.g. "Which screens and API should this include?").

### Step 1: Call Architect (Optional)

- **When to call:** Feature is non-trivial. **Call Architect** when: new API module or new API surface, new user flow or screen with its own state, multiple modules or packages affected, changes to module/package boundaries, new integration (e.g. auth, payment). **Skip Architect** when: single-component or single-file change, one new endpoint in an existing module, tiny UI tweak (styles, copy), single bugfix in existing code.
- **Model:** Invoke the Architect with the **most capable model available** (e.g. pass `model` to `mcp_task` if supported — strongest model such as Claude Opus / extended thinking). The Architect agent is defined to use `model: best`; the Orchestrator should not use a "fast" or default model for this call.
- **Prompt to pass:** Feature description + request to produce the full architectural design per `.cursor/agents/architect.md` (overview, backend/frontend, contracts, constraints_for_orchestrator, steering_rules, risks). Ask for output in the JSON structure defined in architect.md.
- **After call:**
  - If `architecture_conflict: true` → report to user with `conflict_reason` and `suggested_refactor`; stop workflow.
  - Otherwise keep: `architecture` (full design), `constraints_for_orchestrator`, `contracts`, `steering_rules`, `risks`.

### Step 2: Call Planner

- **Input to pass:** Feature description; optionally full architecture output (or summary) and explicit note: "Use constraints_for_orchestrator and contracts from the architecture if provided." If a **design folder path** was provided (e.g. design ready in `designs/<name>/`), include it so the Planner can scope frontend tasks to implement from that design.
- **Prompt:** Ask Planner to produce the task list and execution plan per `.cursor/agents/planner.md`: tasks with `id`, `title`, `description`, `scope`, `depends_on`, `acceptance_criteria`, `expected_output`, `assignee`, `parallel_group`. Request execution plan (phases and order).
- **Output to keep:** `tasks` (array), execution plan (which task runs when, and which are parallel).
- **You (Orchestrator) do not create the plan** — only call the Planner and use its output.
- **Validate Planner output before executing:** For each task: (1) `scope` is non-empty, (2) `assignee` exists in the Agent Registry, (3) `depends_on` has no circular references (if you detect a cycle, ask Planner to fix or report to user). Reject or clarify with Planner if any task fails these checks.

### Step 3: Execute Tasks in Order

- Resolve order from the execution plan (respect `depends_on` and `parallel_group`). **Parallel execution:** Within one phase, all tasks that share the same non-null `parallel_group` value must be run **in parallel**: launch them with multiple `mcp_task` calls (one per task), wait for all to complete, then for each task call the matching Reviewer. Tasks with no `parallel_group` or with different `parallel_group` values run sequentially (one Worker → one Reviewer, then next task).
- **Retry limit (Orchestrator):** You (Orchestrator) maintain a **rework_count** per task, initially **0**. This prevents infinite Worker ↔ Reviewer loops. Maximum **3 retries** per task: after the 1st FAILED review you may retry once, after the 2nd FAILED again, after the 3rd FAILED once more; after the 4th FAILED (or when rework_count would exceed 3) do not retry — run the circuit breaker. After each FAILED review for a task, **increment** that task’s rework_count before deciding to retry or break.
- For **each task** (or batch of tasks in the same `parallel_group`):

  1. **Call Worker (assignee)**  
     - `subagent_type` = value from Agent Registry for this task’s `assignee`.  
     - **Prompt:** Include:
       - Task: `title`, `description`, `scope`, `acceptance_criteria`, `expected_output`
       - Architecture summary or relevant contracts (and steering_rules if any)
       - Instruction: "Implement only within the given scope; do not change architecture or out-of-scope files."
     - Capture the agent’s summary (files changed, key decisions).

  2. **Call Reviewer**  
     - Use the reviewer that matches the domain: `frontend-reviewer` for `frontend-worker` tasks, `backend-reviewer` for `backend-worker` tasks.  
     - **Prompt:** Include:
       - The same task (acceptance_criteria, scope)
       - Architecture plan / contracts (so reviewer can check compliance)
       - Request: "Review the changes made for this task (see attached context / diff). Output either APPROVED or FAILED with issues as in .cursor/agents/<domain>-reviewer.md (e.g. frontend-reviewer.md or backend-reviewer.md)."

  3. **If review result is APPROVED**  
     - Mark task done; continue to the next task (or phase).

  4. **If review result is FAILED**  
     - **Increment** this task’s rework_count (Orchestrator keeps the count).  
     - If rework_count for this task **&lt; 3**: pass the reviewer’s issues back to the same Worker (same task + list of issues to fix) and go to step 3.1 for this task again.  
     - If rework_count **≥ 3**: run **circuit breaker** for this task (see “After 3 retries” below); then continue with the next task or report to user — do not retry this task again.

### Step 3.5: Test Phase (after all implementation tasks)

Run testers in order; maintain **test_retry_count** (initially **0**). Maximum **3 test retry cycles** (no more than 3 tries) to avoid infinite loops: if tests fail, rework affected tasks (Worker → Reviewer), then re-run test phase; after 3 such cycles, run the test circuit breaker.

**Context to pass to each tester:** Feature summary and the **list of tasks relevant to that tester** (frontend-tester: tasks with assignee `frontend-worker`; backend-tester: tasks with assignee `backend-worker`; e2e-tester: all implementation tasks or key flows), each with `title`, `description`, `scope`, `acceptance_criteria`, `expected_output`. Testers use this to design test cases, write or extend tests, then run the suite.

1. **Call frontend-tester**  
   - `subagent_type` = `frontend-tester`.  
   - **Prompt:** “Include feature summary and the list of **frontend tasks** (assignee frontend-worker) with title, description, scope, acceptance_criteria, expected_output. Ask: Design test cases from these tasks and acceptance_criteria, write or extend frontend tests to cover them, then run the frontend test suite. Report Test Result: PASSED or FAILED with Summary and, if FAILED, Failures (for Worker) and Suggested focus per .cursor/agents/frontend-tester.md.”  
   - If **PASSED**, continue to step 3.5.2.  
   - If **FAILED**: go to step 3.5.4 (test rework cycle).

2. **Call backend-tester**  
   - `subagent_type` = `backend-tester`.  
   - **Prompt:** “Include feature summary and the list of **backend tasks** (assignee backend-worker) with title, description, scope, acceptance_criteria, expected_output. Ask: Design test cases from these tasks and acceptance_criteria, write or extend backend tests to cover them, then run the backend test suite. Report Test Result: PASSED or FAILED with Summary and, if FAILED, Failures (for Worker) and Suggested focus per .cursor/agents/backend-tester.md.”  
   - If **PASSED**, continue to step 3.5.3.  
   - If **FAILED**: go to step 3.5.4 (test rework cycle).

3. **Call e2e-tester**  
   - `subagent_type` = `e2e-tester`.  
   - **Prompt:** “Include feature summary and the list of **all implementation tasks** (or key flows) with title, description, scope, acceptance_criteria, expected_output. Ask: Design E2E test cases from the feature and tasks, write or extend E2E/integration tests, then build and run them. Report Test Result: PASSED or FAILED with Summary and, if FAILED, Failures (for Worker) and Suggested focus per .cursor/agents/e2e-tester.md.”  
   - If **PASSED**, go to Step 3.6 (Docs Phase).  
   - If **FAILED**: go to step 3.5.4 (test rework cycle).

4. **Test rework cycle (when any tester reported FAILED)**  
   - **Increment** test_retry_count.  
   - If test_retry_count **≥ 3**: run **test circuit breaker** (see “After 3 test retries” below); then go to Step 3.6 (Docs Phase). Do not retry again — maximum 3 test retry cycles.  
   - **Identify affected tasks** by domain: frontend failure → tasks with assignee `frontend-worker`; backend failure → tasks with assignee `backend-worker`; E2E failure → all implementation tasks or those suggested by e2e-tester.  
   - For each affected task (in execution order): call **Worker** with the task + “Test Result: FAILED” and the tester’s Failures/Suggested focus; then call **Reviewer** with the same task and the Worker's changes.  
   - If any review is FAILED, handle with the existing per-task rework_count (max 3 per task).  
   - When all affected tasks have been reworked and **reviewed (APPROVED)**, go back to step 3.5.1 (re-run frontend-tester, then backend-tester, then e2e-tester). Flow: Orchestrator → Worker (feedback) → Reviewer → if APPROVED, Orchestrator re-runs test phase. Do not increment test_retry_count for review failures inside this cycle — only when a tester again reports FAILED.

### Step 3.6: Docs Phase (after test phase, before report)

Call **docs-writer** once to create or update documentation. No retry loop; if the subagent is unavailable, note in the report and continue.

1. **Call docs-writer**  
   - `subagent_type` = `docs-writer`.  
   - **Prompt:** Include:  
     - Feature name/summary; list of completed tasks (id, title, short outcome); key files changed; test phase result (PASSED or FAILED).  
     - Optional: architecture summary (overview, main contracts).  
     - Optional: `adr_candidate` from Architect output if present (e.g. `{ "title": "ADR-0001: Short title", "suggest_file": "docs/adr/ADR-0001-title.md" }`).  
     - Instruction: “Create or update documentation per .cursor/agents/docs-writer.md. Output Docs Result: DONE or SKIPPED with Summary and files created/updated.”  
   - Capture the docs-writer’s output (Summary, Files created, Files updated, Notes).  
   - If docs-writer subagent is unavailable, skip this step and note “Documentation phase skipped (docs-writer not available).” in the report.  
2. **Proceed to Step 4** with the docs summary (or skip note) for inclusion in the final report.

### Step 4: Report to User

- Summarize: feature name, which tasks were completed, which (if any) failed or were frozen.
- Summarize test phase: frontend/backend/e2e PASSED or FAILED; if test circuit breaker triggered, which tester failed and after how many retries.
- Summarize docs phase: what docs-writer did (files created/updated) or that it was skipped; if Architect had suggested an ADR and docs-writer created it, mention the path (e.g. `docs/adr/ADR-0001-title.md`).
- List important files changed and any manual verification steps.
- If Architect suggested an ADR but docs-writer did not create it (e.g. unavailable), mention the suggested path and that the user can create the file from `docs/adr/ADR-TEMPLATE.md`. See `docs/adr/README.md` for when and how to add ADRs.

---

## Context Handoffs (What to Pass Where)

| From → To        | Pass                                                                 |
|------------------|----------------------------------------------------------------------|
| User → Architect | Feature description + optional pointer to `vector-racers-tasks.md` / `.cursor/agents/vector-racers-context.md`. |
| User → Orchestrator | When design is ready: design folder path (e.g. `designs/<feature-slug>/`). |
| Architect → Planner | Feature + architecture JSON (or summary) + constraints_for_orchestrator + contracts. |
| Orchestrator → Planner | Feature + architecture (if any); **design folder path** when provided by user. |
| Planner → Orchestrator | tasks array + execution plan (Orchestrator uses this to run Workers/Reviewers). |
| Orchestrator → Worker | One task (title, description, scope, acceptance_criteria, expected_output) + architecture/contracts relevant to that task. For **frontend** tasks: **design folder path** when provided (implement UI to match HTML/CSS in that folder). |
| Worker → Reviewer | Same task + architecture/contracts + description of changes (or diff). |
| Reviewer → Worker (rework) | Same task + "Review Result: FAILED" and the list of issues. |
| Orchestrator → Tester | Feature summary + list of tasks relevant to that tester (with title, description, scope, acceptance_criteria, expected_output). Request: design test cases, write or extend tests, run suite, report PASSED/FAILED per .cursor/agents/<tester>.md. |
| Tester → Orchestrator | Test Result: PASSED or FAILED; if FAILED, Summary, Failures (for Worker), Suggested focus. |
| Orchestrator → Worker (test rework) | Affected task(s) + "Test Result: FAILED" + tester’s Failures and Suggested focus. |
| Orchestrator → docs-writer | Feature summary, completed tasks, key files changed, test phase result, optional architecture summary, optional adr_candidate. |
| docs-writer → Orchestrator | Docs Result: DONE or SKIPPED; Summary; Files created/updated; Notes. |
| Any phase → User | Final report; on conflict or circuit breaker, reason and next steps. |

---

## Failure and Conflict Handling

- **Architect returns architecture_conflict:** Stop; report `conflict_reason` and `suggested_refactor` to user.
- **Planner returns clarification questions:** Return those questions to the user; resume after answer.
- **Review FAILED (rework_count &lt; 3):** Increment rework_count for that task; send issues to Worker, retry same task (max 3 retries per task).
- **Review FAILED (rework_count ≥ 3) — circuit breaker:** Do not retry. Apply “After 3 retries” and continue or report.
- **Test FAILED (test_retry_count &lt; 3):** Increment test_retry_count; rework affected tasks (Worker → Reviewer), then re-run test phase (frontend-tester → backend-tester → e2e-tester).
- **Test FAILED (test_retry_count ≥ 3) — test circuit breaker:** Do not retry tests. Apply “After 3 test retries” and report to user.
- **Worker, Reviewer, or Tester subagent unavailable:** Report to user that the assignee type is not available and list available subagent types.

### After 3 retries (circuit breaker for a task)

When a task has already had 3 retries and the review fails again (or rework_count ≥ 3):

1. **Freeze the task** — mark it as failed/frozen; do not call the Worker again for this task.
2. **Summarize failure** — task id, title, and a short summary of recurring issues from the last (or all) review(s).
3. **Suggest next steps** for the user (pick as appropriate):
   - Re-run the feature with a narrower scope or after architectural reassessment (e.g. call Architect again).
   - Decompose the task into smaller subtasks (e.g. call Planner again with “split task TASK-X”).
   - Fix the task manually and continue; or skip and proceed with the rest of the plan.
4. **Continue or stop:** By default, continue with the next task in the plan (if any) and include the frozen task in the final report. If the frozen task blocks the whole feature, report to the user and optionally pause the workflow so they can decide.
5. **Report to user** — in the final summary list the frozen task, the failure summary, and the suggested next steps.

### After 3 test retries (test circuit breaker)

When the test phase has already been retried 3 times (test_retry_count ≥ 3) and a tester still reports FAILED:

1. **Stop test rework** — do not call Workers or testers again for this test phase.
2. **Summarize** — which tester failed (frontend/backend/e2e), last failure summary, and which tasks were reworked.
3. **Suggest next steps** for the user (e.g. run tests locally, fix flaky tests, narrow scope, or reassess architecture).
4. **Continue to Step 4** — include test failure and suggestion in the final report to the user.

---

## Checklist Before Starting the Workflow

- [ ] Feature description is clear enough (or one clarifying question asked).
- [ ] **Vector Racers:** `.cursor/agents/vector-racers-context.md` and `vector-racers-tasks.md` consulted for stack boundaries (Prisma only in `packages/db`, no `@vector-racers/db` in `apps/web`).
- [ ] Agent Registry table is aligned with available `subagent_type` values in your environment.
- [ ] You have access to `mcp_task` and can pass `subagent_type` and a detailed `prompt` for each agent.

---

## Checklist Before Reporting to User

- [ ] All completed tasks are listed with their outcomes.
- [ ] Test phase result (PASSED or FAILED, and which tester if FAILED) is summarized.
- [ ] Docs phase result (what docs-writer created/updated, or that it was skipped) is summarized.
- [ ] Any frozen task or test circuit breaker has a short failure reason and suggestion.
- [ ] ADR suggestion or created ADR path (if any) is mentioned.
- [ ] Key files changed and manual verification steps are summarized.
