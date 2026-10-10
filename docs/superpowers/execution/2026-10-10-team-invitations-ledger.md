# Registo de execução: sub-projeto 2C Equipa e convites

Registo das decisões (Ruling), correções da revisão final (Final: fixed) e itens adiados durante a execução do [plano](../plans/2026-10-10-team-invitations.md). Texto original do ledger de execução, em inglês.

Spec: docs/superpowers/specs/2026-10-10-team-invitations-design.md
Branch: feat/team

## Ledger

- Pre-flight: Task 4 consumes Task 1 tables and Task 2 weeklyLoad/canLoseFounder; Task 5 consumes Task 1 can_read_project and project_staff_assignments; Task 7 consumes Task 3 inviteClientUser and Task 2 canLoseDecisionMaker; Task 8 consumes Tasks 3, 4 and 7 services. No conflicts.
- Task 2: Ruling: startOfWeek added to tasks/domain/groups beside endOfWeek and reused by weeklyLoad — cost if wrong: none
- Task 2: complete (team domain 4/4 RED→GREEN, tasks domain still green: 14/14)
- Task 1: Ruling: rooms RLS test 'manager and freelancer read assigned clients only' now assigns the freelancer to the project, as spec decision 2 requires project assignment — cost if wrong: none
- Task 1: Ruling: can_read_task gained a project argument (4-arg function, old 3-arg dropped) so project tasks follow can_read_project — cost if wrong: none
- Task 1: Ruling: seedRoomRecords extracted from createRoomFixture to seed a second project in createTeamFixture — cost if wrong: none
- Task 1: complete (team RLS 5/5 RED (relation missing) → GREEN after migrations dry-run and applied to dev; full RLS suite 105/106 then rooms fix 17/17 on rooms, team, tasks)
- Task 3: Ruling: invite services take a new InvitationLinkPort (link returned, OS email) while bootstrapFounder keeps AdminPort through BootstrapDeps — cost if wrong: none
- Task 3: Ruling: organizationSender and activeFounders moved from commercial notifications to the email module so identity sends without depending on commercial — cost if wrong: none
- Task 3: Ruling: existing accounts get a magic link to /callback (signs in and accepts) instead of an invite link — cost if wrong: an existing user sets no new password, which is correct
- Task 3: Ruling: db tests written first but run after the code (DB busy with the RLS suite); RED proven by running them against the previous invitations.ts: 6 failed — cost if wrong: none
- Task 3: complete (invitations db 11/11, invite-link 5/5, templates 10/10)
- Task 4: Ruling: last-founder refusal kept as defence in depth, but services make it unreachable (only founders manage and nobody changes or revokes themselves); the test checks a founder revoking another founder and the self refusal — cost if wrong: none
- Task 4: Ruling: setRates needs no recent MFA (not a permission change); role, access and assignments do (SEC-03) — cost if wrong: one requireRecentMfa call
- Task 4: complete (team service db 9/9 RED (module missing) → GREEN)
- Task 5: Ruling: loaders take the readable project ids from a user-context query (RLS), keeping can_read_project the single rule, instead of a parallel visibleProjectIds helper — cost if wrong: one extra query per room load
- Task 5: Ruling: step and project-task assignees that are freelancers must be on the project (isRoomStaff gained projectId); otherwise the assignee could not see the work — cost if wrong: none
- Task 5: Ruling: isRoomStaff now ignores archived client assignments and archived memberships (found while extending it; reachable once 2C unassigns clients) — process test covers it — cost if wrong: none
- Task 5: complete (room db 6/6, feed 4/4, process 11/11, tasks 9/9; each new test RED first)
- Task 6: Ruling: task assigned email uses ICU selects for client or studio and for a missing date; notice skips tasks done or reassigned since the event — cost if wrong: none
- Task 6: Ruling: 'self assignment emits nothing' passed before emission existed; it guards the rule once emission is in place — cost if wrong: none
- Task 6: complete (notifications db 8/8, tasks db 13/13, templates 10/10, inngest registry 1/1; new tests RED first except the self-assignment guard)
- Task 7: Ruling: the last-decision-maker refusal is kept as defence in depth but is unreachable through the services (only decision makers manage and nobody changes or revokes themselves); the test pins the self refusals — cost if wrong: none
- Task 7: complete (colleagues db 4/4 RED (module missing) → GREEN)
- Task 8: Ruling: settings tabs moved to a pure settingsNavItems function so the founder-only Team tab is unit tested — cost if wrong: none
- Task 8: Ruling: portal colleagues link sits in the portal main navigation for decision makers (permission team) rather than inside the settings footer — cost if wrong: one navigation move
- Task 8: Ruling: MemberForm got its own test (role, rates, revoke) beyond the plan list, since the page depends on it — cost if wrong: none
- Task 8: complete (team components 5/5, navigation 14/14, settings items 1/1 RED→GREEN; unit 582/582)
- Task 9: Ruling: freelancer room assertion checks the assigned project's phase and the absence of the other project's name and phase (a single project shows no project name) — cost if wrong: none
- Task 9: e2e team.spec 2/2 locally (after e2e:seed); final review dispatched (opus)
- Task 9: complete (e2e team.spec 2/2; authentication, rooms, tasks, accessibility e2e 20/20 locally)
- Final review: opus reviewer, With fixes (0 critical, 3 important, 10 minor)
- Final: fixed client account invited to the team kept kind client and bypassed SEC-01 — invitations 'a client account cannot join the team' RED→GREEN (RED proven against previous invitations.ts)
- Final: fixed repeat invitations reporting success while doing nothing — invitations 'inviting again resends to pending members and refuses active or revoked ones' and 'a revoked client user can be invited again' RED→GREEN; colleagues pass already_member through
- Final: fixed room people and task assignee options listing unassigned staff and freelancers off the project — room 'unassigned staff and freelancers off the project are not offered' and tasks 'unassigned staff are not offered as assignees' RED→GREEN; roomPeople now filters with isRoomStaff
- Final: Ruling: grantCorePortalAccess links an already-active client member instead of failing now that inviteClientUser refuses active members — cost if wrong: none
- Final: Ruling: room test 'room shows the project selector…' now assigns the freelancer to the project before expecting them in people, matching RN-51 — cost if wrong: none
- Final: Ruling: reviewer minor 3 (team list does not show clients) re-graded Important — spec §3.1 lists clients; client count rendered and unused table keys removed — team table test RED→GREEN
- Final: minor (deferred): last founder / last decision maker guards can race (no row lock)
- Final: minor (deferred): restoring a never-accepted invitation sets it active instead of invited
- Final: minor (deferred): revoke has no confirmation step
- Final: minor (deferred): own member page shows role and revoke controls that are refused with a generic message
- Final: minor (deferred): invitation email copy assumes a password for existing accounts and promises approvals and invoices to every client role
- Final: minor (deferred): task assigned notice does not check the assignee membership is still active
- Final: minor (deferred): Sender alias in commercial notifications, duplicate link building in invite-link, assignment actions do not coerce assigned to boolean
- Final: minor (deferred): a refused membership insert can leave an orphan auth user
- Final: Ruling: declined-to-judge items (portal SEC-03, rates and invite without SEC-03, no finance rates UI, first-client portal, host header links, capture mode storing links, auto-accept on sign-in, decision makers inviting internal emails, feed project ids in memory, redirect handling in useTeamAction) stand as reviewed — pre-existing or outside the spec, and the spec's decision 6 limits SEC-03 to studio permission changes — cost if wrong: revisit with the security review before launch
