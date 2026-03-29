# Branch Protection Security Gates

The repository cannot enforce branch protection settings via source code alone.  
Configure branch protection in GitHub for `main` and require all jobs in `Security Gates` to pass before merge.

Required status checks:
- `Backend dependency audit (pip-audit)`
- `Frontend dependency audit (npm audit)`
- `Python SAST (Bandit)`
- `Secret scan (Gitleaks)`
- `Container and IaC scan (Trivy)`

Recommended settings:
- Require pull request before merging.
- Require approvals (at least 1 reviewer).
- Dismiss stale approvals on new commits.
- Require conversation resolution before merging.
- Restrict force pushes and branch deletion.
