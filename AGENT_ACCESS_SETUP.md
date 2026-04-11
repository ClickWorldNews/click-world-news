# Agent Access Setup (GitHub + Railway)

Run these once on the desktop environment that will do deployments.

## GitHub auth

1. Install GitHub CLI (`gh`) if missing.
2. Authenticate:

```bash
gh auth login
```

Choose:
- GitHub.com
- HTTPS
- Login with browser

3. Verify:

```bash
gh auth status
```

## Railway auth

1. Install Railway CLI:

```bash
npm i -g @railway/cli
```

2. Authenticate:

```bash
railway login
```

3. Verify:

```bash
railway whoami
```

## Repo + deploy checks

```bash
cd /home/user/.hermes/hermes-agent/work/click-world-news
git remote -v
railway status
```

## Then perform release push/deploy

```bash
git checkout main
git pull
# apply/cherry-pick desired commit(s)
git push origin main
```

If Railway is linked to `main`, deploy is automatic. Otherwise:

```bash
railway up
```
