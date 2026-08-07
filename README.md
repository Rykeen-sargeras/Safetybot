# Safetybot v2

This version includes:

- Discord verification panel
- Verify Membership / Check Status / Recheck Membership buttons
- Password-protected `/admin`
- Creator connection only inside admin
- Connected creator management
- Membership level -> Discord role mapping
- Grace period per creator
- Force Sync
- Automatic audits
- Post the verification panel from the admin dashboard
- `/verify` and `/setup-verification` Discord slash commands

## Railway variable to add

ADMIN_PASSWORD=THEmatchaman69420

Keep all your existing Railway variables too.

## Admin page

https://verification-bot-production-942f.up.railway.app/admin

## Test health

https://verification-bot-production-942f.up.railway.app/health

## Important Discord setup

Enable Server Members Intent.

Bot needs Manage Roles.

The bot's role must be ABOVE every membership role.

## Google redirect URI

https://verification-bot-production-942f.up.railway.app/auth/google/callback

## Discord redirect URI

https://verification-bot-production-942f.up.railway.app/auth/discord/callback
