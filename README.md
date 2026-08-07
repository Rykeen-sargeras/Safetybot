# Safetybot — YouTube Membership Role Bot

A Railway-ready Discord bot that links a Discord user's connected YouTube account, lets creators authorize YouTube membership access, and maps membership levels to Discord roles.

## Railway domain

`https://verification-bot-production-942f.up.railway.app`

## Required Railway variables

Copy the names from `.env.example` into Railway. Keep all real tokens and secrets in Railway only.

You also need a Railway PostgreSQL service and must reference its `DATABASE_URL` from the bot service.

## Callback URLs

Google OAuth:
`https://verification-bot-production-942f.up.railway.app/auth/google/callback`

Discord OAuth:
`https://verification-bot-production-942f.up.railway.app/auth/discord/callback`

## Test

Health check:
`https://verification-bot-production-942f.up.railway.app/health`

User linking:
`https://verification-bot-production-942f.up.railway.app/link/discord`

Creator authorization:
`https://verification-bot-production-942f.up.railway.app/creator/start`

## Important

YouTube's `members.list` endpoint is restricted. Each membership-enabled creator must authorize their own channel, and Google/YouTube may need to approve the Cloud project for membership API access.
