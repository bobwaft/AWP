# Graph Report - AWP  (2026-10-16)

## Corpus Check
- 278 files · ~359,656 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 20 file(s) not represented in the graph (top: (none) 8, .css 3, .jsonl 3)

## Summary
- 3318 nodes · 6233 edges · 170 communities (158 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 232 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0318f877`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- live-browser.js
- initGlobalBar
- modern-screenshot.umd.js
- connectSSE
- el
- Hardening Controls
- actOnAgentTarget
- setLiveState
- renderDesignVisual
- SpecSession
- new-work.md
- package.json
- Code Review and Quality
- Accessibility Foundations
- Test-Driven Development
- Wireframe
- Context Engineering
- live.md
- Git Workflow and Versioning
- Interaction Patterns
- Optimization Patterns
- AWP — Design Spec
- cleanup
- Shipping and Launch
- desktop/package.json
- API and Interface Design
- Browser Testing with DevTools
- Frontend UI Engineering
- Information Architecture
- Core capabilities
- CI/CD and Automation
- Constraint-Driven Development
- Deprecation and Migration
- Measurement Frameworks
- Documentation and ADRs
- onboard.md
- createLiveBrowserDomHelpers
- Incremental Implementation
- Code Simplification
- Debugging and Error Recovery
- impeccable/SKILL.md
- AWP — Implementation Plan
- spec/planning.test.ts
- Impeccable Asset Producer
- The Toolkit
- engine.rs
- Regulatory Landscape
- App.tsx
- Organize
- showToast
- Content Strategy
- Service Design
- Interview Me
- Planning and Task Breakdown
- tauri.conf.json
- ReOrder: Keep Your Regulars Ordering Direct
- Idea Refine
- engine/package.json
- mountSvelteComponentVariant
- createLiveBrowserSessionState
- actOnAgentTarget
- biome.json
- protocol/src/index.ts
- intent/SKILL.md
- viewer.js
- AWP — Architecture
- Articulate
- Doubt-Driven Development
- adapt.md
- animate.md
- Handle `generate`
- Process
- Generate Report
- Intent
- Using Agent Skills
- New visual work
- optimize.md
- Spec-Driven Development
- session.ts
- engine/src/project.ts
- Scan mode (approach C: auto-extract, then confirm descriptive language)
- Source-Driven Development
- Groups
- Refinement & Evaluation Criteria
- critique.md
- Simplify the Design
- Hardening Dimensions
- tokens.test.ts
- 5. User flow
- compilerOptions
- clarify.md
- Nielsen's 10 Heuristics
- document.md
- polish.md
- quieter.md
- BUGS
- AWP — Product Requirements Document
- AWP — agent instructions
- doctor.md
- Generate Combined Critique Report
- Init flow
- Run Phase
- PhaseBarrel.tsx
- Ideation Frameworks Reference
- Common Cognitive Load Violations
- iOS platform
- Operate mode depth (and Read notes)
- Shape
- initGlobalBar
- AWP — Registry seed list
- 6. Features
- adapt.native.md
- Android platform
- colorize.md
- Persona-Based Design Testing
- claude.ts
- orchestrator.ts
- prompts/package.json
- protocol/package.json
- prompts/src/index.ts
- desktop/tsconfig.json
- Impeccable Finish Reviewer
- Impeccable Manual Edit Applier
- Generate Report
- Cognitive Load Assessment
- Impeccable Finish Reviewer
- Impeccable Manual Edit Applier
- live-browser-ignores.js
- serve.ts
- Diagnostic Scan
- SetupView.tsx
- app.test.tsx
- Visualize: Direction Comps & Asset Production
- pty.rs
- Navigation Patterns
- default.json
- Impeccable Documenter
- Impeccable Documenter
- react
- setup-view.test.tsx
- 3d/package.json
- Heuristics Scoring Guide
- Region map
- engine/src/setup.ts
- dependencies
- engine/tsconfig.json
- prompts/tsconfig.json
- protocol/tsconfig.json
- registry/package.json
- architect.md
- code-reviewer.md
- implementer.md
- researcher.md
- .claude/CLAUDE.md
- idea-refine.sh
- awp
- build-engine.ts
- ChatPanel.tsx
- secrets.rs
- applyEditing
- Extract Flow
- dependencies
- devDependencies
- SpecService
- MarkdownEditor.tsx
- scripts

## God Nodes (most connected - your core abstractions)
1. `SpecSession` - 60 edges
2. `EngineError` - 42 edges
3. `Button()` - 36 edges
4. `connectSSE()` - 34 edges
5. `setLiveState()` - 33 edges
6. `resumeSession()` - 33 edges
7. `showToast()` - 31 edges
8. `react` - 31 edges
9. `el()` - 30 edges
10. `initGlobalBar()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `BUG-014` --references--> `QuestionList()`  [INFERRED]
  BUGS.md → apps/desktop/src/components/QuestionList.tsx
- `3.2 UI (`apps/desktop/src`)` --references--> `RifleDiagram2D()`  [INFERRED]
  ARCHITECTURE.md → apps/desktop/src/components/RifleDiagram2D.tsx
- `Phase 7 — Design stage` --references--> `ThemeCard()`  [INFERRED]
  IMPLEMENTATION.md → apps/desktop/src/components/ThemeCard.tsx
- `5.1 Setup` --references--> `git()`  [INFERRED]
  PRD.md → packages/engine/src/git.ts
- `BUG-003` --references--> `freshEnv()`  [INFERRED]
  BUGS.md → packages/engine/src/setup.ts

## Import Cycles
- None detected.

## Communities (170 total, 12 thin omitted)

### Community 0 - "live-browser.js"
Cohesion: 0.03
Nodes (120): applyGlobalBarLabelState(), applyLiveBarPreference(), applyParamValue(), applyPlaceholderSizingStyles(), averageRgb01(), beginEditPin(), bindEditBadgeProxy(), bufferToBase64() (+112 more)

### Community 1 - "initGlobalBar"
Cohesion: 0.10
Nodes (45): armPageChatForTyping(), attachSteerFocusDebug(), attachSteerFocusGuard(), clearSteerAwaitTimer(), clearSteerFocusRecoverTimer(), collapsePageChat(), expandPageChat(), finishVoiceSession() (+37 more)

### Community 2 - "modern-screenshot.umd.js"
Cohesion: 0.09
Nodes (55): ae(), be(), bt(), Ce(), s(), Ct(), de(), dt() (+47 more)

### Community 3 - "connectSSE"
Cohesion: 0.09
Nodes (67): applyParamDefaults(), applyPlaceholderDimensions(), applySavedSessionMeta(), checkpointPayload(), closedClipPath(), completeParameterGenerationIfReady(), completeParameterPublication(), completeSourceInjection() (+59 more)

### Community 4 - "el"
Cohesion: 0.07
Nodes (57): actionLabel(), applyConfigureBarChrome(), bindConfigureCountPillTooltip(), bindConfigureInlineControlHover(), bindConfigureModifierPillHover(), buildConfigureActionControl(), buildConfigureCountControl(), buildConfigureRow() (+49 more)

### Community 5 - "Hardening Controls"
Cohesion: 0.05
Nodes (42): Broken Access Control, Broken Authentication, Cross-Site Scripting (XSS), Data Classification, Dependency Audit Triage, Destructive Operations on Derived Paths, File Upload Safety, Hardening Patterns (+34 more)

### Community 6 - "actOnAgentTarget"
Cohesion: 0.19
Nodes (24): clearStoredManualApplyState(), fetchPendingCount(), handleManualEditActivity(), hidePendingApplyDock(), manualApplyLoadingText(), manualApplyStateKey(), manualEditEventForCurrentPage(), numberOrNull() (+16 more)

### Community 7 - "setLiveState"
Cohesion: 0.12
Nodes (46): beginNewLiveConfiguration(), cancelEditing(), cancelEditingToPicking(), cancelInsertConfigure(), clearAnnotations(), clearInsertPicking(), closeTunePopover(), cursorForInsertAxis() (+38 more)

### Community 8 - "renderDesignVisual"
Cohesion: 0.08
Nodes (39): buildCollapsible(), buildColorModels(), buildDesignHeader(), buildListHtml(), buildRadiiModels(), buildTypographyModels(), cssSafe(), designEmptyMessage() (+31 more)

### Community 9 - "SpecSession"
Cohesion: 0.12
Nodes (11): Phase 7, EngineError, tokensFromFormValues(), resolveFields(), msg(), now(), slot(), SpecSession (+3 more)

### Community 10 - "new-work.md"
Cohesion: 0.07
Nodes (23): Recommended Actions, Craft (deprecated alias), Apply, Live-mode signature params, Set the spatial thesis, Two isolated assessments, Verify, Visitor mode (+15 more)

### Community 11 - "package.json"
Cohesion: 0.12
Nodes (15): devDependencies, @biomejs/biome, typescript, vitest, name, private, scripts, build (+7 more)

### Community 12 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 13 - "Accessibility Foundations"
Cohesion: 0.07
Nodes (29): Accessibility Foundations, Aging, Assistive Technology Landscape, Cognitive Accessibility, Consistent Patterns, Error Prevention, Focus Management, Inclusive Design Beyond Disability (+21 more)

### Community 14 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 15 - "Wireframe"
Cohesion: 0.07
Nodes (29): 1. Screen anatomy & zoning, 2. Hierarchy without styling, 3. Layout patterns, 4. Content-first wireframing, 5. Annotation discipline, 6. Wireflow & prototype assembly, 7. Divergence practice, Ask first (+21 more)

### Community 16 - "Context Engineering"
Cohesion: 0.07
Nodes (28): Anti-Patterns, Common Rationalizations, Compress before dropping, Confusion Management, Context Budget Management, Context Engineering, Context Packing Strategies, Level 1: Rules Files (+20 more)

### Community 17 - "live.md"
Cohesion: 0.07
Nodes (26): Step 1: Parse the request, Step 2: Reuse the page, then start, Step 3: Generate, Step 4: Accept and close, Cleanup, Exit, First-time setup, Handle `accept` (+18 more)

### Community 18 - "Git Workflow and Versioning"
Cohesion: 0.07
Nodes (26): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Branch Naming, Branching Strategy, Change Summaries (+18 more)

### Community 19 - "Interaction Patterns"
Cohesion: 0.08
Nodes (26): Anti-Patterns in Progressive Disclosure, Button States, Design Principles for Undo, Destructive Action Safeguards, Error Message Design, Feedback Loops, Field Grouping, Form Design Principles (+18 more)

### Community 20 - "Optimization Patterns"
Cohesion: 0.06
Nodes (33): on(), Constraints, Failure modes, Flow, /impeccable hooks, Routing, Triage findings, Connection Pool Exhaustion (+25 more)

### Community 21 - "AWP — Design Spec"
Cohesion: 0.07
Nodes (26): 10. Open questions, 1. Design principles, 2.1 Model requirements, 2.2 Stage → part map ("load → aim → fire"), 2.3 Camera, 2.4 Lighting and rendering, 2.5 Performance fallback (2D mode), 2. The 3D rifle (+18 more)

### Community 22 - "cleanup"
Cohesion: 0.11
Nodes (34): abortSvelteComponentInjection(), buildInsertPlaceholderSnapshotFromDom(), buildPickedAnchorSnapshot(), captureAndEmit(), cleanup(), cleanupAcceptedSession(), clearHandled(), clearMountErrorCard() (+26 more)

### Community 23 - "Shipping and Launch"
Cohesion: 0.08
Nodes (25): Accessibility, Code Quality, Common Rationalizations, Documentation, Error Budget Release Gate, Error Reporting, Feature Flag Strategy, Infrastructure (+17 more)

### Community 24 - "desktop/package.json"
Cohesion: 0.10
Nodes (20): @awp/prompts, @awp/protocol, @types/node, name, private, type, version, @fontsource/geist-mono (+12 more)

### Community 25 - "API and Interface Design"
Cohesion: 0.08
Nodes (24): 1. Contract First, 2. Consistent Error Semantics, 3. Validate at Boundaries, 4. Prefer Addition Over Modification, 5. Predictable Naming, 6. Honouring an Idempotency Key, API and Interface Design, Common Rationalizations (+16 more)

### Community 26 - "Browser Testing with DevTools"
Cohesion: 0.08
Nodes (24): Accessibility Verification with DevTools, Available Tools, Browser Testing with DevTools, Clean Console Standard, Common Rationalizations, Console Analysis Patterns, Content Boundary Markers, For Network Issues (+16 more)

### Community 27 - "Frontend UI Engineering"
Cohesion: 0.08
Nodes (24): Accessibility (WCAG 2.1 AA), ARIA Labels, Avoid the AI Aesthetic, Color, Common Rationalizations, Component Architecture, Component Patterns, Design System Adherence (+16 more)

### Community 28 - "Information Architecture"
Cohesion: 0.11
Nodes (18): Applied Mental Model Theory, Card Sort and Tree Test Methodology, Core Wayfinding Principles, Don't-Know-What-I-Don't-Know, Exploratory Search, Information Architecture, Known-Item Search, Lynch's Spatial Elements (+10 more)

### Community 29 - "Core capabilities"
Cohesion: 0.08
Nodes (24): 10. Journey state management, 1. End-to-end flow mapping, 2. User context & variation handling, 3. Task analysis & flow optimization, 4. Flow optimization patterns, 5. Copy specifications, 6. Interaction & animation specifications, 7. Device-aware design (+16 more)

### Community 30 - "CI/CD and Automation"
Cohesion: 0.08
Nodes (23): Automation Beyond CI, Basic CI Pipeline, Build Cop Role, CI/CD and Automation, CI Optimization, Common Rationalizations, Dependabot / Renovate, Deployment Strategies (+15 more)

### Community 31 - "Constraint-Driven Development"
Cohesion: 0.08
Nodes (22): Adapting it, Contract, Floor guard: reference implementation, Reference (Node, ~stack-agnostic patterns), Common Rationalizations, Constraint-Driven Development, Escalation Path, Loading Constraints (+14 more)

### Community 32 - "Deprecation and Migration"
Cohesion: 0.08
Nodes (23): Adapter Pattern, Code Is a Liability, Common Rationalizations, Compulsory vs Advisory Deprecation, Core Principles, Database Schema Migrations (Expand/Contract), Deprecation and Migration, Deprecation Planning Starts at Design Time (+15 more)

### Community 33 - "Measurement Frameworks"
Cohesion: 0.08
Nodes (23): A/B Test Design, Applying HEART by Feature Type, Common GSM Mistakes, Confidence Intervals, Effect Size, Engagement vs. Wellbeing, Ethical Measurement, Ethical Measurement Principles (+15 more)

### Community 34 - "Documentation and ADRs"
Cohesion: 0.09
Nodes (22): ADR Lifecycle, ADR Template, API Documentation, Architecture Decision Records (ADRs), Changelog Maintenance, Common Rationalizations, Document Known Gotchas, Documentation and ADRs (+14 more)

### Community 35 - "onboard.md"
Cohesion: 0.09
Nodes (22): Assess Onboarding Needs, Context Over Ceremony, Contextual Help, Design Onboarding Experiences, Documentation & Help, Empty State Design, Feature Discovery & Adoption, Guided Tours & Walkthroughs (+14 more)

### Community 36 - "createLiveBrowserDomHelpers"
Cohesion: 0.14
Nodes (16): createLiveBrowserDomHelpers(), cloneWithoutChrome(), cssId(), liveUiRoot(), makeFrozenAnchor(), own(), pickable(), raiseHitModal() (+8 more)

### Community 37 - "Incremental Implementation"
Cohesion: 0.09
Nodes (22): Common Rationalizations, Contract-First Slicing, Implementation Rules, Increment Checklist, Incremental Implementation, Overview, Red Flags, Risk-First Slicing (+14 more)

### Community 38 - "Code Simplification"
Cohesion: 0.09
Nodes (21): 1. Preserve Behavior Exactly, 2. Follow Project Conventions, 3. Prefer Clarity Over Cleverness, 4. Maintain Balance, 5. Scope to What Changed, Code Simplification, Common Rationalizations, Language-Specific Guidance (+13 more)

### Community 39 - "Debugging and Error Recovery"
Cohesion: 0.09
Nodes (21): Build Failure Triage, Common Rationalizations, Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, Overview, Red Flags, Runtime Error Triage (+13 more)

### Community 40 - "impeccable/SKILL.md"
Cohesion: 0.11
Nodes (14): Before you finish, Scope is sovereign, The amplification, The skeleton test, Why it reads flat, Craft floor, Refuse, Verify (+6 more)

### Community 41 - "AWP — Implementation Plan"
Cohesion: 0.12
Nodes (17): check(), AWP — Implementation Plan, Conventions, Decisions needed before or during the build, How to run a phase, Phase 0 — Monorepo scaffold, Phase 10 — Model routing, Phase 12 — Security stage (+9 more)

### Community 42 - "spec/planning.test.ts"
Cohesion: 0.08
Nodes (25): Phase 3 — Claude adapter + run stream, Phase 3, parseFixture(), Block, createClaudeParser(), FILE_TOOLS, FakeAdapter, FIXTURE_DIR (+17 more)

### Community 43 - "Impeccable Asset Producer"
Cohesion: 0.10
Nodes (18): Core Rule, Decision Comps, Impeccable Asset Producer, Input Contract, Output Contract, Review handoff, The job, Act on the receipt (+10 more)

### Community 44 - "The Toolkit"
Cohesion: 0.10
Nodes (20): Animate complex properties, Assess What "Extraordinary" Means Here, For data-heavy interfaces, For functional UI, For performance-critical UI, For visual/marketing surfaces, Implement with Discipline, Interact with the device (+12 more)

### Community 45 - "engine.rs"
Cohesion: 0.10
Nodes (13): allow_restart(), answer_engine_request(), emit(), Engine, engine_request(), MAX_RESTARTS, old_crashes_expire(), request_line() (+5 more)

### Community 46 - "Regulatory Landscape"
Cohesion: 0.10
Nodes (20): Addictive Design → Respectful Engagement, Anti-Pattern Remediation Guide, California CPRA (2023) and Automated Decision-Making, Common consent failures, Consent Design Patterns, Consent interface patterns, Consequence Scanning, COPPA (United States, 1998 / Updated 2013) (+12 more)

### Community 47 - "App.tsx"
Cohesion: 0.07
Nodes (51): App(), EngineToasts(), Shell(), View, CommandPalette(), Props, RifleDiagram2D(), RING (+43 more)

### Community 48 - "Organize"
Cohesion: 0.10
Nodes (19): 1. Navigation pattern design, 2. Taxonomy design, 3. Labeling systems, 4. Search and browse design, 5. Wayfinding design, 6. IA research methods, Ask first, Core capabilities (+11 more)

### Community 49 - "showToast"
Cohesion: 0.18
Nodes (18): abandonForeignSession(), abandonSupersededGo(), copyToClipboard(), discardOrphanedSession(), handleAccept(), handleDiscard(), isVariantShown(), loadDetectScript() (+10 more)

### Community 50 - "Content Strategy"
Cohesion: 0.08
Nodes (23): Building a Terminology Glossary, Confirmation Messages, Content Modeling, Content Reuse, Content Strategy, Empty States, Jargon Management, Localization-Ready Content (+15 more)

### Community 51 - "Service Design"
Cohesion: 0.10
Nodes (19): Channel Orchestration, Cross-Channel Consistency, Designing for Moments of Truth, Fail Point Categories, Fail Point Identification and Recovery Design, Identifying Moments of Truth, Modern Blueprint Layers, Moment-of-Truth Analysis (+11 more)

### Community 52 - "Interview Me"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Example, Interaction with Other Skills, Interview Me, Loading Constraints, Output, Overview, Red Flags (+10 more)

### Community 53 - "Planning and Task Breakdown"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Output Files, Overview, Parallelization Opportunities, Plan Document Template, Planning and Task Breakdown, Red Flags, See Also (+10 more)

### Community 54 - "tauri.conf.json"
Cohesion: 0.11
Nodes (18): app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist (+10 more)

### Community 55 - "ReOrder: Keep Your Regulars Ordering Direct"
Cohesion: 0.11
Nodes (17): Example 1: Vague Early-Stage Concept (Full 3-Phase Session), Example 2: Feature Idea Within an Existing Product (Codebase-Aware), Example 3: Process/Workflow Idea (Non-Product), Ideation Session Examples, Key Assumptions to Validate, MVP Scope, Not Doing (and Why), Open Questions (+9 more)

### Community 56 - "Idea Refine"
Cohesion: 0.11
Nodes (17): Anti-patterns to Avoid, Common Rationalizations, Detailed Instructions, How It Works, Idea Refine, Output, Overview, Phase 1: Understand & Expand (Divergent) (+9 more)

### Community 57 - "engine/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, @types/node, @awp/prompts, @awp/protocol, @types/node, zod, main, name (+6 more)

### Community 58 - "mountSvelteComponentVariant"
Cohesion: 0.12
Nodes (26): acceptedDomAlreadyClean(), applyOriginalAttrsToSvelteAnchor(), clearHandledWrapperReloadStamp(), commitAcceptedSvelteComponentToDom(), componentModuleCandidates(), deferredRecoverySuperseded(), describeMountFailure(), detectDevServerBase() (+18 more)

### Community 59 - "createLiveBrowserSessionState"
Cohesion: 0.22
Nodes (15): createLiveBrowserSessionState(), clearHandled(), clearScrollY(), clearSession(), isHandled(), loadSession(), markHandled(), nextCheckpointRevision() (+7 more)

### Community 60 - "actOnAgentTarget"
Cohesion: 0.24
Nodes (19): actOnAgentTarget(), agentTargetBusyReason(), agentTargetOverlayGone(), agentTargetTaken(), claimAgentTarget(), claimAndActOnAgentTarget(), declineAgentTargetBusy(), declineAgentTargetUnresolvable() (+11 more)

### Community 61 - "biome.json"
Cohesion: 0.12
Nodes (16): css, parser, files, includes, formatter, indentStyle, indentWidth, quoteStyle (+8 more)

### Community 62 - "protocol/src/index.ts"
Cohesion: 0.11
Nodes (26): call(), EngineError, EngineEvent, name, createHandler(), fail(), handleLine(), Handlers (+18 more)

### Community 63 - "intent/SKILL.md"
Cohesion: 0.10
Nodes (17): Affinity Mapping, Bias Avoidance in Research, Common Communication Failures, Communicating Findings, Evaluative Methods (Is this working?), Evidence Strength Indicators, Findings Format, Generative Methods (What should we build?) (+9 more)

### Community 64 - "viewer.js"
Cohesion: 0.20
Nodes (15): fit(), frames, go(), histBack(), indexLinks, linked, nextBtn, prevBtn (+7 more)

### Community 65 - "AWP — Architecture"
Cohesion: 0.09
Nodes (24): 10. Build and release, 11. Risks and constraints, 1. System overview, 2. Key decisions, 5. Project layout (what AWP writes into the user's repo), 6. Phase runner, 7. Routing, 8. Security model (+16 more)

### Community 66 - "Articulate"
Cohesion: 0.12
Nodes (15): 1. Voice and tone framework creation, 2. Error message design, 3. Empty state design, 4. CTA and action language, 5. Microcopy patterns, 6. Content modeling, 7. Inclusive language, Articulate (+7 more)

### Community 67 - "Doubt-Driven Development"
Cohesion: 0.12
Nodes (15): Common Rationalizations, Cross-model escalation, Doubt-Driven Development, Interaction with Other Skills, Loading Constraints, Overview, Red Flags, Step 1: CLAIM — Surface what stands (+7 more)

### Community 68 - "adapt.md"
Cohesion: 0.08
Nodes (25): Assess Adaptation Challenge, Breakpoints: Content-Driven, Content Adaptation, Desktop Adaptation (Mobile → Desktop), Detect Input Method, Not Just Screen Size, Email Adaptation (Web → Email), Implement Adaptations, Layout Adaptation Patterns (+17 more)

### Community 69 - "animate.md"
Cohesion: 0.12
Nodes (14): Accessibility and control, Choose material by meaning, Find the job, Implement to the runtime, Set the motion thesis, Timing and easing, Verify, Visitor mode (+6 more)

### Community 70 - "Handle `generate`"
Cohesion: 0.12
Nodes (16): 1. Read the screenshot (if present), 2. Wrap the element, 3. Load the action's reference, 4. Plan three variants: identity first, then mode, then axes, 5. Apply the freeform prompt (if present), 6. Deliver variants, 7. Parameters (composition-sized, 0-4 per variant), 8. Signal done (+8 more)

### Community 71 - "Process"
Cohesion: 0.12
Nodes (15): 1. Define "working" before instrumenting, 2. Pick the right signal for each question, 3. Structured logging, 4. Metrics, 5. Distributed tracing, 6. Alerting, 7. Verify the telemetry itself, Common Rationalizations (+7 more)

### Community 72 - "Generate Report"
Cohesion: 0.13
Nodes (14): 1. Accessibility (A11y), 2. Performance, 3. Theming, 4. Responsive Design, 5. Implementation Integrity (CRITICAL), Audit Health Score, Detailed Findings by Severity, Diagnostic Scan (+6 more)

### Community 73 - "Intent"
Cohesion: 0.05
Nodes (39): 1. Respect user autonomy, 2. Design for real conditions, 3. Make intent visible, 4. Evidence over intuition, 5. Systems over screens, 6. Ethical defaults, Assessment-to-action pipeline, By what the user needs done (+31 more)

### Community 74 - "Using Agent Skills"
Cohesion: 0.13
Nodes (14): 1. Surface Assumptions, 2. Manage Confusion Actively, 3. Push Back When Warranted, 4. Enforce Simplicity, 5. Maintain Scope Discipline, 6. Verify, Don't Assume, Core Operating Behaviors, Failure Modes to Avoid (+6 more)

### Community 75 - "New visual work"
Cohesion: 0.14
Nodes (14): 1. Decide what is already true, 2. Ask what will change the work, 3. Choose the right amount of invention, 4. Commit the world, 5. Record the decision, 6. Build with full commitment, 7. Inspect and finish, Both paths (+6 more)

### Community 76 - "optimize.md"
Cohesion: 0.14
Nodes (13): Animation Performance, Assess Performance Issues, Core Web Vitals Optimization, Cumulative Layout Shift (CLS < 0.1), Interaction to Next Paint (INP < 200ms), Largest Contentful Paint (LCP < 2.5s), Loading Performance, Network Optimization (+5 more)

### Community 77 - "Spec-Driven Development"
Cohesion: 0.14
Nodes (13): Common Rationalizations, Keeping the Spec Alive, Overview, Phase 0: Scope Check, Phase 1: Specify, Phase 2: Plan, Phase 3: Tasks, Phase 4: Implement (+5 more)

### Community 78 - "session.ts"
Cohesion: 0.04
Nodes (71): HandlerOpts, ACTIVE_TOOLS, runMcpServer(), toolList(), isToolName(), ToolName, TOOLS, AdapterFactory (+63 more)

### Community 79 - "engine/src/project.ts"
Cohesion: 0.13
Nodes (9): 4. Engine protocol (JSON-RPC 2.0), BUG-007, No-argument routing: the context-aware menu, Phase 5, createHandlers(), absolute(), ProjectService, RunManager (+1 more)

### Community 80 - "Scan mode (approach C: auto-extract, then confirm descriptive language)"
Cohesion: 0.15
Nodes (13): Component translation rules, Narrative mapping, Scan mode (approach C: auto-extract, then confirm descriptive language), Schema, Step 1: Find the design assets, Step 2: Auto-extract what can be auto-extracted, Step 2b: Stage the frontmatter, Step 3: Ask the user for qualitative language (+5 more)

### Community 81 - "Source-Driven Development"
Cohesion: 0.15
Nodes (12): Common Rationalizations, Overview, Red Flags, Retrieval Safety: Treat Fetched Content as Data, Source-Driven Development, Step 1: Detect Stack and Versions, Step 2: Fetch Official Documentation, Step 3: Implement Following Documented Patterns (+4 more)

### Community 82 - "Groups"
Cohesion: 0.15
Nodes (13): G10 · Service connectors — *complementary, suggested only when the PRD/stack uses the service*, G11 · Meta and setup — *used by AWP, not suggested to users by default*, G12 · Workflow methodology — *reference only; never suggested into AWP projects (owner decision)*, G1 · Codebase understanding — *pick one*, G2 · Library docs lookup — *pick one*, G3 · Token saving and output style — *complementary* (with care), G4 · Session memory — *optional*, G5 · Design direction and taste — *pick one* (+5 more)

### Community 83 - "Refinement & Evaluation Criteria"
Cohesion: 0.17
Nodes (11): 1. User Value, 2. Feasibility, 3. Differentiation, Assumption Audit, Core Evaluation Dimensions, Decision Framework, Might Be True (Nice to Have), Must Be True (Dealbreakers) (+3 more)

### Community 84 - "critique.md"
Cohesion: 0.17
Nodes (11): Action Summary, Ask the User, Assessment A: Design Review, Assessment B: Detector + Browser Evidence, Assessment Orchestration, Deliver the Report, Hard Invariants, Persist the Snapshot (+3 more)

### Community 85 - "Simplify the Design"
Cohesion: 0.17
Nodes (11): Assess Current State, Code Simplification, Content Simplification, Document Removed Complexity, Information Architecture, Interaction Simplification, Layout Simplification, Plan Simplification (+3 more)

### Community 86 - "Hardening Dimensions"
Cohesion: 0.17
Nodes (11): Accessibility Resilience, Assess Hardening Needs, Edge Cases & Boundary Conditions, Error Handling, Hardening Dimensions, Input Validation & Sanitization, Internationalization (i18n), Performance Resilience (+3 more)

### Community 87 - "tokens.test.ts"
Cohesion: 0.50
Nodes (3): css, lum(), ratio()

### Community 88 - "5. User flow"
Cohesion: 0.17
Nodes (12): 5.10 Shipping, 5.1 Setup, 5.2.1 Spec gate rule (Ideation, Design, Planning), 5.2 Ideation, 5.3 Design, 5.4 Planning, 5.5 Connectors / Tools / MCPs, 5.6 Implementation (+4 more)

### Community 89 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, skipLibCheck (+3 more)

### Community 90 - "clarify.md"
Cohesion: 0.18
Nodes (10): Actions and navigation, Audit the language, Errors and permissions, Forms, Help and instructional text, Loading, empty, and success states, Rewrite by function, Set the message hierarchy (+2 more)

### Community 91 - "Nielsen's 10 Heuristics"
Cohesion: 0.18
Nodes (11): 10. Help and Documentation, 1. Visibility of System Status, 2. Match Between System and Real World, 3. User Control and Freedom, 4. Consistency and Standards, 5. Error Prevention, 6. Recognition Rather Than Recall, 7. Flexibility and Efficiency of Use (+3 more)

### Community 92 - "document.md"
Cohesion: 0.18
Nodes (10): Pitfalls, Seed mode, Step 1: Route through new-work's workshop, Step 2: Write seed DESIGN.md, Step 3: Confirm, Style guidelines, The frontmatter: token schema, The markdown body: eight sections (canonical order) (+2 more)

### Community 93 - "polish.md"
Cohesion: 0.18
Nodes (10): 1. Establish the system, 2. Gather the evidence, 3. Triage, 4. Polish the whole path, 5. Verify and finish, Color, imagery, and icons, Content and code, Flow and hierarchy (+2 more)

### Community 94 - "quieter.md"
Cohesion: 0.18
Nodes (10): Assess Current State, Color Refinement, Composition Refinement, Motion Reduction, Plan Refinement, Refine the Design, Simplification, Verify Quality (+2 more)

### Community 95 - "BUGS"
Cohesion: 0.12
Nodes (16): BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-006, BUG-008, BUG-009 (+8 more)

### Community 96 - "AWP — Product Requirements Document"
Cohesion: 0.18
Nodes (11): 10. Out of scope (v1), 11. Risks, 12. Open questions, 1. Problem, 2. Solution, 3. Target users, 4. Principles, 7. Functional requirements (summary) (+3 more)

### Community 97 - "AWP — agent instructions"
Cohesion: 0.20
Nodes (9): AWP — agent instructions, Bugs, Definition of done (every phase), Design tools, graphify, Model routing, Plan, Specs (+1 more)

### Community 98 - "doctor.md"
Cohesion: 0.22
Nodes (8): summary(), Monorepo notes, Opting out of the boot check, Step 1: Run the pass, Step 2: Act by severity, Step 3: Deprecated fields are binding, Step 4: Do not overclaim on truth drift, What this owns, and what it does not

### Community 99 - "Generate Combined Critique Report"
Cohesion: 0.20
Nodes (10): Design Health Score, Design Specificity Verdict, Generate Combined Critique Report, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider (+2 more)

### Community 100 - "Init flow"
Cohesion: 0.20
Nodes (10): Completion gate, Init flow, Step 1: Load current state, Step 2: Explore the project, Step 3: Interview for product truth, Step 4: Write PRODUCT.md, Step 5: Record workflow defaults, Step 6: Wrap up or resume (+2 more)

### Community 101 - "Run Phase"
Cohesion: 0.20
Nodes (9): 0. Identify the phase, 1. Plan (once per phase), 2. Explore (only when needed), 3. Implement each TODO (main session, test-first), 4. Review (once per phase), 5. Close out, Cost rules, Parallel TODOs (optional) (+1 more)

### Community 102 - "PhaseBarrel.tsx"
Cohesion: 0.20
Nodes (18): PhaseBarrel(), Phase 8 — Planning stage, Phase 8, Cmd, mergePhases(), movePhase(), parsePhasesMd(), parseVerifyCommands() (+10 more)

### Community 103 - "Ideation Frameworks Reference"
Cohesion: 0.22
Nodes (8): Analogous Inspiration, Constraint-Based Ideation, First Principles Thinking, How Might We (HMW), Ideation Frameworks Reference, Jobs to Be Done (JTBD), Pre-mortem, SCAMPER

### Community 104 - "Common Cognitive Load Violations"
Cohesion: 0.22
Nodes (9): 1. The Wall of Options, 2. The Memory Bridge, 3. The Hidden Navigation, 4. The Jargon Barrier, 5. The Visual Noise Floor, 6. The Inconsistent Pattern, 7. The Multi-Task Demand, 8. The Context Switch (+1 more)

### Community 105 - "iOS platform"
Cohesion: 0.22
Nodes (9): Color & materials, Components & controls, iOS platform, Layout & structure, Motion, The iOS slop test, Touch targets, Typography (+1 more)

### Community 106 - "Operate mode depth (and Read notes)"
Cohesion: 0.22
Nodes (9): Color, Components, Layout, Motion, Operate mode depth (and Read notes), Product constraints, Product permissions, The product slop test (+1 more)

### Community 107 - "Shape"
Cohesion: 0.22
Nodes (8): Cadence, Confirm and stop, Phase 1: Discovery interview, Phase 2: Resolve the design direction, Phase 3: Write the brief, Round 1: purpose, people, and outcome, Round 2: material, behavior, and boundaries, Shape

### Community 108 - "initGlobalBar"
Cohesion: 0.10
Nodes (31): agentHasWorkInFlight(), agentStatusText(), barPaletteForTheme(), brandMarkSvg(), buildParamsPanel(), buildSteerProcessingDots(), buildSteerQueueHint(), designPanelCss() (+23 more)

### Community 109 - "AWP — Registry seed list"
Cohesion: 0.22
Nodes (7): AWP — Registry seed list, Defaults when a new project reaches Connectors, Excluded, Kinds, License policy (owner decision, 2026-10-15), Owner verification checklist, Pinned metadata

### Community 110 - "6. Features"
Cohesion: 0.22
Nodes (9): 6.1 Pre-loaded prompts, 6.2 Pre-loaded skills, 6.3.1 Chat plus structured input, 6.3 Live spec panel, 6.4 Model routing, 6.5 Project dashboard, 6.6 Usage tracking, 6.7 Built-in terminal (+1 more)

### Community 111 - "adapt.native.md"
Cohesion: 0.25
Nodes (7): Adaptation Strategies, Assess Adaptation Challenge, Implement & Verify, Orientation & foldables, Phone → Tablet (iPad / large screens), Platform → platform (iOS ↔ Android), Web → native (porting a website or web app)

### Community 112 - "Android platform"
Cohesion: 0.25
Nodes (8): Android platform, Color & theming, Components & motion, Layout & structure, The Android slop test, Touch targets, Typography, Verifying the build

### Community 113 - "colorize.md"
Cohesion: 0.25
Nodes (7): Apply at system scale, Audit before choosing, Choose a strategy, Contrast and perception, Live-mode signature params, Verify, Visitor mode

### Community 114 - "Persona-Based Design Testing"
Cohesion: 0.25
Nodes (8): 1. Impatient Power User: "Alex", 2. Confused First-Timer: "Jordan", 3. Accessibility-Dependent User: "Sam", 4. Deliberate Stress Tester: "Riley", 5. Distracted Mobile User: "Casey", Persona-Based Design Testing, Project-Specific Personas, Selecting Personas

### Community 115 - "claude.ts"
Cohesion: 0.21
Nodes (6): buildArgs(), ClaudeCodeAdapter, exec, TESTED_MAJOR_MINOR, killTree(), spawnTree()

### Community 116 - "orchestrator.ts"
Cohesion: 0.28
Nodes (14): Review of phases 3-8 (fixed), clone(), completeStage(), enterStage(), idx(), initialState(), later(), markLaterStale() (+6 more)

### Community 117 - "prompts/package.json"
Cohesion: 0.25
Nodes (7): main, name, private, scripts, typecheck, type, version

### Community 118 - "protocol/package.json"
Cohesion: 0.18
Nodes (10): dependencies, zod, zod, main, name, private, scripts, typecheck (+2 more)

### Community 119 - "prompts/src/index.ts"
Cohesion: 0.09
Nodes (10): FormTemplate, LIBRARY, loadPrompt(), name, promptIds(), SECTION_SCHEMAS, SectionSchema, parsePrompt() (+2 more)

### Community 120 - "desktop/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, resolveJsonModule, types, extends, include, ../../tsconfig.base.json

### Community 121 - "Impeccable Finish Reviewer"
Cohesion: 0.29
Nodes (6): Checks, in order, Disposition, Impeccable Finish Reviewer, Input Contract, Output Contract, Verdict Pass

### Community 122 - "Impeccable Manual Edit Applier"
Cohesion: 0.29
Nodes (6): Checks, Entry Atomicity, Impeccable Manual Edit Applier, Input Contract, Output Contract, Workflow

### Community 123 - "Generate Report"
Cohesion: 0.29
Nodes (7): Audit Health Score, Detailed Findings by Severity, Executive Summary, Generate Report, Patterns & Systemic Issues, Platform Conformance Verdict, Positive Findings

### Community 124 - "Cognitive Load Assessment"
Cohesion: 0.29
Nodes (7): Cognitive Load Assessment, Cognitive Load Checklist, Extraneous Load: Bad Design, Germane Load: Learning Effort, Intrinsic Load: The Task Itself, The Working Memory Rule, Three Types of Cognitive Load

### Community 125 - "Impeccable Finish Reviewer"
Cohesion: 0.29
Nodes (6): Checks, in order, Disposition, Impeccable Finish Reviewer, Input Contract, Output Contract, Verdict Pass

### Community 126 - "Impeccable Manual Edit Applier"
Cohesion: 0.29
Nodes (6): Checks, Entry Atomicity, Impeccable Manual Edit Applier, Input Contract, Output Contract, Workflow

### Community 127 - "live-browser-ignores.js"
Cohesion: 0.52
Nodes (6): globToRegex(), matchesScope(), normalizeIgnoreRule(), normalizeIgnoreValue(), pageCandidates(), resolveDetectIgnores()

### Community 128 - "serve.ts"
Cohesion: 0.19
Nodes (8): createOutbound(), call(), getSecret(), Outbound, handle, logFile, outbound, rl

### Community 129 - "Diagnostic Scan"
Cohesion: 0.33
Nodes (6): 1. Accessibility (VoiceOver / TalkBack), 2. Performance, 3. Appearance & Theming, 4. Platform Conformance (CRITICAL), 5. Adaptivity, Diagnostic Scan

### Community 130 - "SetupView.tsx"
Cohesion: 0.09
Nodes (41): AccountsCard(), Button(), Card(), FormSummaryCard(), show(), Input(), Props, CardState (+33 more)

### Community 131 - "app.test.tsx"
Cohesion: 0.33
Nodes (4): current(), loaded(), state, status

### Community 132 - "Visualize: Direction Comps & Asset Production"
Cohesion: 0.33
Nodes (5): After approval: the comp becomes a spec, Generate three compositional options, One approval point, Plates and provenance, Visualize: Direction Comps & Asset Production

### Community 134 - "pty.rs"
Cohesion: 0.13
Nodes (9): default_shell(), Pty, pty_kill(), pty_resize(), pty_spawn(), pty_write(), Ptys, SpawnOpts (+1 more)

### Community 135 - "Navigation Patterns"
Cohesion: 0.33
Nodes (6): Dashboard, Faceted, Flat, Hierarchical (Tree), Hub-and-Spoke, Navigation Patterns

### Community 136 - "default.json"
Cohesion: 0.40
Nodes (4): identifier, permissions, $schema, windows

### Community 137 - "Impeccable Documenter"
Cohesion: 0.40
Nodes (4): Impeccable Documenter, Input Contract, Output Contract, Workflow

### Community 138 - "Impeccable Documenter"
Cohesion: 0.40
Nodes (4): Impeccable Documenter, Input Contract, Output Contract, Workflow

### Community 139 - "react"
Cohesion: 0.06
Nodes (47): AgentRunStream(), Props, Row(), Props, VARIANTS, ChatPanel(), PHASE, Props (+39 more)

### Community 140 - "setup-view.test.tsx"
Cohesion: 0.06
Nodes (22): call, verify, call, s, invoke, listen, call, Handler (+14 more)

### Community 141 - "3d/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 142 - "Heuristics Scoring Guide"
Cohesion: 0.50
Nodes (4): Heuristics Scoring Guide, Issue Severity (P0–P3), Reference Material, Score Summary

### Community 143 - "Region map"
Cohesion: 0.40
Nodes (4): Containment, Painted material, Region map, What varies independently

### Community 144 - "engine/src/setup.ts"
Cohesion: 0.26
Nodes (11): Phase 4, isSupportedVersion(), defaultRunner(), detectTools(), execFileP, expandWinVars(), freshEnv(), parseRegPath() (+3 more)

### Community 145 - "dependencies"
Cohesion: 0.40
Nodes (5): dependencies, @awp/prompts, @awp/protocol, @modelcontextprotocol/sdk, zod

### Community 146 - "engine/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, resolveJsonModule, types, extends, include, ../../tsconfig.base.json

### Community 147 - "prompts/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, resolveJsonModule, extends, include, ../../tsconfig.base.json

### Community 148 - "protocol/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 149 - "registry/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 162 - "ChatPanel.tsx"
Cohesion: 0.11
Nodes (20): fields, form, AGAINST, CHIP_MARK, CHIP_TEXT, ChipState, Control(), FONTS (+12 more)

### Community 163 - "secrets.rs"
Cohesion: 0.22
Nodes (12): accounts_list(), entry(), get(), index_path(), key(), keychain_round_trip(), read_index(), secret_delete() (+4 more)

### Community 164 - "applyEditing"
Cohesion: 0.06
Nodes (41): addManualContextText(), applyEditing(), buildLocatorForLeaf(), canRestoreManualEditElement(), collectEditableTextRows(), visit(), collectManualContextPieces(), walk() (+33 more)

### Community 165 - "Extract Flow"
Cohesion: 0.25
Nodes (7): Extract Flow, Step 1: Discover the Design System, Step 2: Identify Patterns, Step 3: Plan Extraction, Step 4: Extract & Enrich, Step 5: Migrate, Step 6: Document

### Community 166 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @awp/prompts, @awp/protocol, codemirror, @codemirror/lang-markdown, @codemirror/merge, @codemirror/state, @codemirror/view (+10 more)

### Community 169 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, jsdom, tailwindcss, @tailwindcss/vite, @tauri-apps/cli, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event (+5 more)

### Community 170 - "SpecService"
Cohesion: 0.13
Nodes (8): Full debug 2026-10-16 (BUG-003 to BUG-013), MEMORY, Phase 0, Phase 1, Phase 2, Phase 6, stageForSpec(), SpecService

### Community 174 - "MarkdownEditor.tsx"
Cohesion: 0.25
Nodes (7): Props, theme, codemirror, @codemirror/lang-markdown, @codemirror/merge, @codemirror/state, @codemirror/view

### Community 176 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, tauri, typecheck

## Knowledge Gaps
- **24 isolated node(s):** `@awp/prompts`, `@awp/protocol`, `@fontsource/geist-mono`, `@fontsource/geist-sans`, `@tauri-apps/cli` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1706 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `init()` connect `setLiveState` to `live-browser.js`, `initGlobalBar`, `doctor.md`, `connectSSE`, `Init flow`, `actOnAgentTarget`, `impeccable/SKILL.md`, `initGlobalBar`, `live.md`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `SpecSession` (e.g. with `Phase 6` and `Phase 7`) actually correct?**
  _`SpecSession` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@awp/prompts`, `@awp/protocol`, `@fontsource/geist-mono` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `live-browser.js` be split into smaller, more focused modules?**
  _Cohesion score 0.031746031746031744 - nodes in this community are weakly interconnected._
- **Why does `ProjectState` connect `engine/src/project.ts` to `AWP — Architecture`, `session.ts`, `App.tsx`, `orchestrator.ts`, `protocol/src/index.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Should `initGlobalBar` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `setup-view.test.tsx` to `serve.ts`, `AWP — Architecture`, `ChatPanel.tsx`, `app.test.tsx`, `PhaseBarrel.tsx`, `spec/planning.test.ts`, `react`, `package.json`, `session.ts`, `App.tsx`, `engine/src/setup.ts`, `claude.ts`, `orchestrator.ts`, `prompts/src/index.ts`, `tokens.test.ts`, `protocol/src/index.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._