# Agency OS — Engineering Guidelines

Repository: https://github.com/vs-org-lab/agency-os

## Project tracking (mandatory)

- Read `docs/STATUS.md` at the start of every session before any other work.
- Update it on every completed task, scope change or deferral. Deferred items record the reason and the trigger to revisit.
- Specs live in `docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/`, architecture decisions in `docs/decisions/`.
- Product documentation (requirements, business rules, security, design system) lives in `docs/product/`. On conflict, follow the precedence table in `00 Visão geral.md`; `08 Segurança` prevails on anything security-related.

## Language

- Code, identifiers, commit messages and code comments: English.
- Project documentation (specs, plans, decisions, status): Portuguese (Portugal), matching the product documentation.

## Development workflow (mandatory)

The `superpowers` plugin governs every development task. Before writing code, invoke the applicable superpowers skills:

- `brainstorming` before any new feature, component or behaviour change.
- `writing-plans` before multi-step implementation.
- `test-driven-development` for features and bug fixes.
- `systematic-debugging` for any defect or failing test.
- `verification-before-completion` before declaring work done.
- `requesting-code-review` / `finishing-a-development-branch` before merging.

## Specialist skills (on demand only)

Load these only when the task clearly matches. Do not load them speculatively.

| Skill                                                                                                                               | Use when                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Taste Skill (`design-taste-frontend`, `high-end-visual-design`, `minimalist-ui`, `redesign-existing-projects`)                      | Defining the visual direction of a new interface or redesigning an existing one                                      |
| UI Skills (`baseline-ui`, `improve-ui`, `fixing-accessibility`, `fixing-motion-performance`, `fixing-metadata`, `create-design-md`) | Cleaning up spacing, hierarchy and motion of built screens, accessibility fixes, and documenting the design language |
| Impeccable (`impeccable`)                                                                                                           | Auditing, polishing or hardening a built UI                                                                          |
| UI/UX Pro Max (`ui-ux-pro-max`)                                                                                                     | Selecting palettes, typography, layout patterns and UX rules for a product type                                      |
| GSAP (`gsap-skills`)                                                                                                                | Implementing animation, timelines or ScrollTrigger                                                                   |
| Hyperframes (`hyperframes`)                                                                                                         | Producing rendered video from HTML                                                                                   |
| Humanizer (`humanizer`)                                                                                                             | Editing user-facing copy that reads as machine-generated                                                             |
| Marketing skills (`marketing-skills`)                                                                                               | Copywriting, CRO, SEO, analytics and growth tasks                                                                    |

Backend, infrastructure and CI/CD tasks use superpowers only.

## Code standards

- Write production-grade, professional, impersonal code at enterprise level.
- No conversational or process commentary in code, comments, commits or docs (for example "fixed code", "updated version", "as requested").
- Comments only where they explain non-obvious intent or constraints.
- Descriptive naming, small focused units, explicit error handling, no dead code.
- Commits follow Conventional Commits. Work happens on feature branches and lands through pull requests with passing CI.
