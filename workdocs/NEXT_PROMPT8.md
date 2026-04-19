# NEXT_PROMPT8 — Coder for Plan 2 Task 7 (CampusView animations)

You are a **coder agent** (🔨). Workspace:
`/Users/m.cadilecaceres/dev/tesseron/panoptica`. Branch:
`feature/ralph-panoptica-spec-a-plan2`. Model: `claude-sonnet-4-6`.

Read the Ralph skill + `agents/coder.md`. Continue from **B2**.

## Read first

- `workdocs/SPEC.md` — animation section (office-appear, phase tint, dim)
- `workdocs/PLAN.md` — Task 7 details
- `workdocs/TAKEAWAYS.md`
- `frontend/src/components/campus/RunOfficeCard.tsx` (Task 6)

## Your task

**Task 7: CampusView animations.**

Add:
- `frontend/src/styles/campus-animations.css` (new)
- modify `frontend/src/components/campus/RunOfficeCard.tsx`

Animations (CSS keyframes, GPU-composited only — `transform`, `opacity`, `border-color`):
- Office appear: `scale(0) → scale(1)` + opacity 0→1, 300ms ease-out on mount.
- Phase tint: `border-color` transition 600ms when `run.phase` changes.
- Office dim: `opacity → 0.5` + outcome glyph reveal when `run.outcome != "in_progress"`.

Detect phase transitions via `useRef(prevPhase)` pattern (or similar) to trigger keyframe re-run.

## Constraints

- CSS-only; no new animation libraries.
- No jank — stick to transform/opacity/border-color.
- Do NOT stage pre-existing WIP.

## Success criteria (PLAN.md)

- New card animates in (className/keyframe assertion in test).
- Phase change triggers border-color transition.
- Outcome set dims the card.
- `make checkall` passes.

## When done

Mark Task 7 ✅. Commit: `feat(runs): CampusView animations (Plan 2 Task 7)`. Exit.
