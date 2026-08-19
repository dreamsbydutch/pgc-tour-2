# Development and Operations

This hub routes repeatable setup, verification, deployment, administration, recovery, and safety work. `package.json`, root configuration, scripts, and `.github/workflows/` remain the executable sources of truth.

## Workflows

- [Local development](operations/LOCAL_DEVELOPMENT.md) — prerequisites, environment ownership, dev processes, code generation, and common setup failures.
- [Command reference](reference/COMMANDS.md) — every package script, focused command, prerequisite, output, and mutation risk.
- [Quality and testing](operations/QUALITY_AND_TESTING.md) — test placement, proportional checks, CI differences, Convex I/O guard, and bundle budgets.
- [Deployment](operations/DEPLOYMENT.md) — separate Convex/Vercel artifacts, compatibility order, environment checks, smoke tests, and repository-known unknowns.
- [Admin and automation](operations/ADMIN_AND_AUTOMATION.md) — scheduled jobs, exact boundaries, `syncRuns`, admin workflows, observability, and recovery choices.
- [Data repairs](operations/DATA_REPAIRS.md) — bounded migrations, dry runs, dependency order, cursor handling, audits, and production authorization.
- [Security, performance, and incidents](operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md) — identity/privacy, secrets, CSP, hot reads, common incidents, and escalation evidence.

## Non-negotiable safety boundary

Use a development Convex deployment for tests and experiments. Do not deploy, invoke production repair/migration functions, import production data, send real email/push, rotate credentials, or change live provider configuration without explicit authorization. Diagnose and prepare safely first; authorization for implementation does not imply authorization for a live operation.

Preserve the user's working tree and processes. Track and stop only processes you start, do not hand-edit generated files, and never copy ignored environment values into source or documentation.

## Local versus CI

`npm run check` is the complete **local** application quality gate. GitHub Actions adds environment-dependent Convex generated-drift verification and separate dependency audit, dependency review, Gitleaks, and CodeQL jobs. Passing the local command does not claim those remote security checks passed.

See [known gaps](KNOWN_GAPS.md#architecture-and-operations) for unresolved runtime, deployment, configuration, and CSP facts.
