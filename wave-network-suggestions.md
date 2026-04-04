# Wave Network — Complete Upgrade Suggestions

A production-level, premium, bug-free upgrade plan for every area of the bot.

---

## 1. Bugs to Fix

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 1 | **`/ticket rename` crashes** — uses `new ButtonStyle()` instead of `new ButtonBuilder()`, then calls `interaction.reply()` twice | `commands/Ticket 🎫/ticket.js:168-173` | Replace `new ButtonStyle()` with `new ButtonBuilder()`, remove duplicate `interaction.reply()` |
| 2 | **Permission checks silently pass** — `[bot_perms] || []` wraps the array inside another array, so `.has()` always passes | `events/interaction/interactionCreate.js:46-47` | Change `.has([bot_perms] || [])` → `.has(bot_perms)` |
| 3 | **Blocking `wait()` freezes the bot** — busy-wait loop blocks the entire Node.js event loop | `functions/functions.js:258-262` | Replace with `return new Promise(resolve => setTimeout(resolve, ms))` |
| 4 | **Health check kills bot during startup** — 10s is often too fast for the bot to connect, causing premature `process.exit(1)` | `index.js:95-105` | Skip the first 3 intervals (30s grace period) before checking |
| 5 | **`.env` is committed** — even though empty, the file should be in `.gitignore` | Root `.env` | Add `.env` to `.gitignore`, remove tracked `.env` from git |
| 6 | **`node_modules/` is committed** — 8000+ files bloating the repo | Root | `git rm -r --cached node_modules` and ensure `.gitignore` entry works |

---

## 2. Permission System Overhaul

**Problem:** Many features are restricted to Owner only or require `ManageChannels`. Mods can't access most management features.

**Solution:** Add a 5-tier permission system:

| Level | Name | How to Get |
|-------|------|-----------|
| 4 | Owner | Bot owner IDs in config / Guild owner |
| 3 | Admin | Configurable admin role / `ManageGuild` perm |
| 2 | Moderator | **NEW** configurable mod role / `ManageMessages` perm |
| 1 | Staff | **NEW** configurable staff role / `ManageChannels` perm |
| 0 | Member | Everyone else |

**New command:** `/permissions`
- `/permissions view` — See current role assignments and per-feature overrides
- `/permissions set-role <level> <role>` — Assign a role to admin/mod/staff level
- `/permissions remove-role <level>` — Remove a role assignment
- `/permissions set-feature <feature> <level>` — Set minimum level for a feature (e.g., allow mods to use `/config set`)
- `/permissions reset-feature <feature>` — Reset a feature to default level

**New service:** `permissionService.js`
- `getMemberLevel(db, guild, member)` — Resolve a member's highest permission level
- `checkPermission(db, guild, member, feature)` — Check if member can use a feature
- `getRequiredLevel(db, guildId, feature)` — Get the configured minimum level for a feature
- All commands and event handlers should use this service instead of hardcoded permission checks

**Features that should become configurable:**
- Ticket management (close, delete, rename, reopen, invite, transcript)
- Panel management
- Config view/set/reset
- Settings dashboard
- Moderation commands
- Analytics/stats viewing
- Blacklist management

---

## 3. Ticket System Enhancements

### 3a. Ticket Tags / Labels
- Let staff tag tickets with custom labels (e.g., `bug`, `urgent`, `waiting-on-user`) and filter by them
- Store as `guild_<id>.ticket.tags_<channelId>`
- New command: `/ticket-tag add <tag>`, `/ticket-tag remove <tag>`, `/ticket-tag list`
- Tags visible in ticket channel topic and in ticket-list views

### 3b. Ticket Templates / Canned Responses
- Pre-written response templates staff can insert with one click (e.g., "We need more info", "This is resolved")
- New command: `/canned add <name> <content>`, `/canned list`, `/canned use <name>`, `/canned delete <name>`
- Support variables: `{user}`, `{ticket}`, `{category}`, `{staff}`
- Max 50 canned responses per guild, searchable by name

### 3c. Ticket Threads
- Option to create tickets as Discord threads instead of channels (lighter, less clutter)
- Configurable per-guild via `/config set ticket_mode channel|thread`
- Thread tickets auto-archive after configurable time
- Reduces channel clutter for busy servers

### 3d. Ticket Scheduling
- Auto-delete closed tickets after configurable days
- Schedule ticket channel archival
- New command: `/schedule-close <time>` — auto-close a ticket after a specified delay (e.g., `2h`, `1d`)
- Warning message sent before scheduled close
- `/config set auto_delete_days <number>` to configure auto-delete

### 3e. Ticket Forwarding
- Forward a ticket to another server/department
- New command: `/ticket-forward <category>` — re-route ticket to a different category
- Moves channel to the new category, updates permissions
- Logs the forward action in mod log

### 3f. Ticket Merge
- Merge duplicate tickets from the same user
- New command: `/ticket-merge <other-ticket-channel>` — merge two tickets into one
- Copies transcript of merged ticket into the remaining one
- Closes and deletes the duplicate

### 3g. Ticket SLA (Service Level Agreement)
- Set response time targets per category
- Alert when SLA is about to breach (yellow warning) or has breached (red alert)
- Track SLA compliance rate in analytics
- Configurable via `/config set sla_minutes <number>`
- New service: `slaService.js`

### 3h. Ticket Feedback Follow-up
- Auto DM user X days after ticket close asking if issue stayed resolved
- Configurable follow-up delay via `/config set followup_days <number>`
- Collects "Still resolved" / "Issue returned" response
- Track follow-up satisfaction in analytics

### 3i. Ticket Search / Filter
- New command: `/ticket-search` — search tickets by user, category, status, date range, tag
- Filter open/closed tickets
- Paginated results with embed navigation
- Quick-jump buttons to view ticket channels

### 3j. Smart Rename
- Auto-suggest ticket names based on category + ticket number instead of just `ticket-username`
- Configurable name format via `/config set ticket_name_format <format>`
- Support placeholders: `{category}`, `{number}`, `{username}`, `{date}`

### 3k. Reopen Limit Enforcement
- Already tracked but not enforced
- Add actual enforcement when ticket is reopened — reject if limit exceeded
- Configurable max reopens via `/config set max_reopens <number>`

---

## 4. Staff & Management

### 4a. Staff Shifts / Availability
- Define staff working hours, auto-route tickets to available staff
- Expand existing `/away` command into a proper shift/availability system
- New command: `/shift set <start> <end> <timezone>` — define working hours
- Auto-set "away" status outside working hours
- Tickets created outside shift hours get queued or routed to on-call staff

### 4b. Staff Performance Dashboard
- Detailed per-staff metrics: avg response time, resolution rate, ratings over time
- New command: `/staff-stats [user]` — view detailed performance metrics
- Breakdown by category, time period (daily/weekly/monthly)
- Export stats as text/CSV
- Leaderboard view showing top-performing staff

### 4c. Staff Roles per Category
- Already partially implemented via panels, but extend to legacy ticket system too
- Allow assigning specific staff to specific categories
- Staff only see/get notified about tickets in their assigned categories
- Configurable via `/permissions` or `/config`

### 4d. Escalation System
- Auto-escalate tickets to senior staff if unresolved after X hours
- Two escalation tiers: Tier 1 → Moderator, Tier 2 → Admin
- Configurable: `/config set escalation_hours <number>`
- Logs escalation events in audit log
- Pings escalation target with ticket summary
- New service: `escalationService.js`

### 4e. Internal Staff Notes (Enhanced)
- Already exists (`/ticket-note`), but add a pinned notes thread visible only to staff
- Notes persist across ticket lifecycle
- Searchable staff notes
- Notes visible in transcript export

---

## 5. Community & Engagement

### 5a. Suggestion Voting with Deadlines
- Auto-close suggestion polls after X days
- Configurable deadline per suggestion or globally via `/config set suggestion_deadline_days <number>`
- Announce results when deadline expires
- Archive closed suggestions

### 5b. FAQ Command with Search
- `/faq search <query>` — searches all FAQ entries, not just category matching
- Fuzzy search support
- Display matching FAQs with relevance ranking
- Staff can add/edit/delete FAQ entries via `/faq add <question> <answer>`

### 5c. Knowledge Base
- `/kb add <title> <content>` — a mini wiki system staff can build from resolved tickets
- `/kb search <query>` — search knowledge base entries
- `/kb list` — list all entries
- `/kb delete <title>` — remove entries
- Auto-suggest relevant KB articles when a new ticket is created
- Built from resolved ticket patterns

### 5d. Welcome Ticket
- Auto-create a welcome/onboarding ticket for new server members
- Configurable welcome message template
- Toggle via `/config set welcome_ticket enabled|disabled`
- Set specific category for welcome tickets
- Auto-close after X hours if no response

### 5e. Ticket Satisfaction Trends
- Chart satisfaction ratings over time (weekly/monthly)
- New command: `/feedback trends` — show rating trends in ASCII chart
- `/feedback staff <user>` — view a specific staff member's ratings
- Compare satisfaction across categories
- Export trend data

---

## 6. Automation & Intelligence

### 6a. Smart Auto-Reply
- Instead of hardcoded FAQ rules in `autoReplyService.js`, let admins configure custom auto-reply rules per guild
- New command: `/faq-rules add <keyword> <response>`, `/faq-rules remove <keyword>`, `/faq-rules list`
- Support regex patterns for advanced matching
- Custom auto-reply messages per category
- Multi-language FAQ support tied to guild language setting

### 6b. Duplicate Detection
- Detect if a user's new ticket is similar to an existing open one
- Compare ticket topic/initial message against open tickets
- Warn user: "You may already have an open ticket about this"
- Staff can link related tickets
- Configurable sensitivity threshold

### 6c. Auto-Assign
- Round-robin or load-balanced ticket assignment to staff
- Configurable: `/config set auto_assign round_robin|load_balanced|off`
- Only assigns to online/available staff
- Pings assigned staff in the ticket channel
- Tracks assignment counts for fairness
- New service: `autoAssignService.js`

### 6d. Webhook Integrations
- Send ticket events to external webhooks (e.g., Slack, Trello, Notion)
- New command: `/webhook add <url> <events>`, `/webhook remove <url>`, `/webhook list`
- Configurable event types: ticket_create, ticket_close, ticket_escalate, rating_received
- JSON payload with ticket details
- Retry logic for failed webhook calls

### 6e. Scheduled Messages
- Staff can schedule a message to be sent in a ticket at a future time
- New command: `/schedule-message <time> <message>` — e.g., `/schedule-message 2h "Following up on your issue"`
- List pending scheduled messages: `/schedule-message list`
- Cancel scheduled messages: `/schedule-message cancel <id>`
- Useful for follow-ups and reminders

---

## 7. Admin & Config

### 7a. Audit Log
- Track all config changes, who modified settings and when
- New command: `/audit-log [user] [action]` — view config change history
- Store: action type, user, old value, new value, timestamp
- Retention: last 200 entries per guild
- Filterable by user and action type
- New service: `auditService.js`

### 7b. Backup / Restore
- Export and import guild config as JSON
- New command: `/config export` — download all settings as JSON file
- `/config import` — upload and apply JSON config
- Version stamped for compatibility
- Validates imported config before applying

### 7c. Multi-Language (i18n)
- The settings menu already has a "Setup Bot Language" option (`stlanguage`) but no actual implementation exists
- Add i18n framework with language files
- Support at minimum: English, Spanish, French, German, Portuguese, Hindi
- Per-guild language setting via `/config set language <code>`
- All bot messages, embeds, and error messages translated

### 7d. Web Dashboard
- Config references suggest a web dashboard was planned — build one with Express + OAuth2
- Discord OAuth2 login
- Visual config editor (no slash commands needed)
- Real-time ticket overview and analytics charts
- Staff management interface
- Runs on the existing Express keep-alive server

### 7e. Custom Embed Branding
- Let each server customize embed colors, footer text, and thumbnail globally
- New config keys: `embed_color`, `embed_footer`, `embed_thumbnail`, `embed_author_icon`
- All bot embeds respect these customizations
- Preview command: `/branding preview` — see how embeds will look
- Reset to default: `/branding reset`

### 7f. Enhanced Config Command
- Add more configurable keys: `rating_enabled`, `auto_reply_enabled`, `welcome_message`, `close_message`, `ticket_name_format`, `log_level`
- Better organization of settings into categories
- Config validation — reject invalid values with helpful error messages
- Show current vs default values
- Config audit trail integration

### 7g. Enhanced Settings Dashboard
- Add "Setup Mod Role" option to the settings menu
- Add "Setup Staff Role" option
- Show current permission levels for each feature
- Add on/off toggle for auto-close
- Add on/off toggle for staff reminders
- Add on/off toggle for satisfaction rating DMs
- Add auto-assign configuration

---

## 8. Security & Moderation

### 8a. Alt Account / IP Linking Detection
- Detect alt accounts opening tickets to evade bans
- Track account age, creation date, join date patterns
- Flag suspicious accounts (new account + immediately opening ticket)
- Alert staff when potential alt is detected
- Configurable sensitivity: `/config set alt_detection low|medium|high|off`

### 8b. Ticket Message Blacklist Scanning
- Use the existing `blacklistService` to auto-flag messages inside tickets
- Scan ticket messages for blacklisted words/patterns
- Auto-flag or auto-delete depending on severity
- Alert staff in mod log when blacklisted content detected
- Per-category blacklist rules

### 8c. Rate Limit per Category
- Different cooldowns for different ticket categories
- `/config set cooldown_<category> <minutes>` — e.g., bug reports: 60min, general: 5min
- Override the global ticket cooldown per category
- Show remaining cooldown time to user

### 8d. Verification Gate
- Require users to verify before opening tickets
- Options: role-based (must have a specific role), account age minimum, CAPTCHA button
- Configurable via `/config set verification_mode role|age|captcha|none`
- Set minimum account age: `/config set min_account_age_days <number>`
- Set required role: `/config set verification_role <role>`

---

## 9. Enhanced Existing Features

### 9a. Panel System
| Enhancement | Details |
|-------------|---------|
| **Panel Edit** | `/panel edit <name>` — Edit title, description, color of existing panel without deleting |
| **Panel Duplicate** | `/panel duplicate <name> <new-name>` — Clone an existing panel |
| **Panel Preview** | `/panel preview <name>` — Preview how panel embed will look before sending |
| **Category Reorder** | `/panel reorder <name>` — Change the order of categories in a panel |
| **Per-Category Cooldown** | Different cooldowns for different categories (e.g., bug reports: 1hr, general: 5min) |

### 9b. Analytics & Stats
| Enhancement | Details |
|-------------|---------|
| **Satisfaction Trends** | `/feedback trends` — Show rating trends over time (weekly/monthly chart in ASCII) |
| **Export Stats** | `/ticket-stats export` — Generate a CSV/text file of all analytics data |
| **Busiest Hours** | Track and display peak ticket hours |
| **Resolution Rate** | Calculate % of tickets closed vs deleted |
| **First Response Time** | Show avg first response time per staff member |
| **Category Performance** | Response time and satisfaction breakdown by category |

### 9c. Auto-Reply System
| Enhancement | Details |
|-------------|---------|
| **Configurable FAQ Rules** | Currently hardcoded in `autoReplyService.js`. Make rules configurable per-guild via `/faq-rules add/remove/list` |
| **Custom Auto-Reply Messages** | Let admins write their own auto-reply messages for specific categories |
| **Multi-Language FAQ** | Support different FAQ responses per language setting |

---

## 10. New Services Summary

| Service | File | Description |
|---------|------|-------------|
| **Permission Service** | `permissionService.js` | Centralized 5-tier permission system with configurable role mappings and per-feature overrides |
| **Auto-Assign Service** | `autoAssignService.js` | Round-robin or load-balanced ticket assignment to online staff |
| **SLA Service** | `slaService.js` | Track response time targets per category, alert on breach |
| **Escalation Service** | `escalationService.js` | Auto-escalate unresolved tickets to senior staff after X hours |
| **Audit Service** | `auditService.js` | Log every config/permission/admin change with who/what/when |
| **Canned Response Service** | `cannedService.js` | CRUD for reusable response templates with variable support |
| **Webhook Service** | `webhookService.js` | Send ticket events to external webhooks with retry logic |
| **Knowledge Base Service** | `kbService.js` | Mini wiki system built from resolved tickets |
| **Scheduled Message Service** | `scheduledMessageService.js` | Queue and deliver messages at future times |
| **Duplicate Detection Service** | `duplicateService.js` | Compare new tickets against open ones for similarity |
| **Verification Service** | `verificationService.js` | Gate ticket creation behind verification requirements |
| **i18n Service** | `i18nService.js` | Multi-language support with per-guild language settings |

---

## 11. New Commands Summary

### Ticket Commands
| Command | Level | Description |
|---------|-------|-------------|
| `/ticket-tag add <tag>` | Staff | Add a tag to current ticket |
| `/ticket-tag remove <tag>` | Staff | Remove a tag |
| `/ticket-tag list` | Staff | List all tags on current ticket |
| `/ticket-search <filters>` | Staff | Search tickets by user, category, status, date, tag |
| `/ticket-forward <category>` | Staff | Re-route ticket to different category |
| `/ticket-merge <channel>` | Staff | Merge two tickets into one |
| `/schedule-close <time>` | Staff | Schedule ticket auto-close |

### Staff Commands
| Command | Level | Description |
|---------|-------|-------------|
| `/canned add <name> <content>` | Staff | Save a reusable response template |
| `/canned list` | Staff | List all saved canned responses |
| `/canned use <name>` | Staff | Send a canned response in current ticket |
| `/canned delete <name>` | Staff | Delete a canned response |
| `/snippet add <name> <content>` | Staff | Quick text snippets |
| `/snippet use <name>` | Staff | Insert a snippet |
| `/shift set <start> <end> <tz>` | Staff | Define working hours |
| `/staff-stats [user]` | Mod | View detailed staff performance |
| `/schedule-message <time> <msg>` | Staff | Schedule a future message in ticket |

### Admin Commands
| Command | Level | Description |
|---------|-------|-------------|
| `/permissions view` | Admin | View permission configuration |
| `/permissions set-role` | Admin | Assign role to permission level |
| `/permissions set-feature` | Admin | Set minimum level for a feature |
| `/audit-log [user] [action]` | Mod | View config change history |
| `/config export` | Admin | Export settings as JSON |
| `/config import` | Admin | Import settings from JSON |
| `/branding preview` | Admin | Preview custom embed branding |
| `/branding reset` | Admin | Reset branding to default |
| `/webhook add <url> <events>` | Admin | Add webhook integration |
| `/webhook list` | Admin | List configured webhooks |
| `/webhook remove <url>` | Admin | Remove a webhook |
| `/faq-rules add <keyword> <resp>` | Admin | Add custom auto-reply rule |
| `/faq-rules list` | Admin | List configured FAQ rules |
| `/faq-rules remove <keyword>` | Admin | Remove an auto-reply rule |

### Community Commands
| Command | Level | Description |
|---------|-------|-------------|
| `/faq search <query>` | Member | Search FAQ entries |
| `/faq add <question> <answer>` | Staff | Add FAQ entry |
| `/kb add <title> <content>` | Staff | Add knowledge base article |
| `/kb search <query>` | Member | Search knowledge base |
| `/kb list` | Member | List KB articles |
| `/feedback trends` | Mod | View satisfaction rating trends |
| `/feedback staff <user>` | Mod | View staff member's ratings |
| `/giveaway start <prize> <dur>` | Mod | Start a giveaway |
| `/giveaway end` | Mod | End a giveaway early |
| `/embed create` | Mod | Build a custom embed interactively |

---

## 12. Premium Aesthetic Upgrades

| Area | Current | Upgrade |
|------|---------|---------|
| **Embeds** | Basic colors, inconsistent styling | Consistent gradient-inspired palette, branded footer on all embeds, author fields on all actions |
| **Error Messages** | Generic `⛔ Error` | Contextual error types with icons: 🔒 Permission, ⏱️ Cooldown, 🔍 Not Found, ⚙️ Config Required |
| **Success Messages** | Plain text | Premium styled with checkmark, timestamp, action summary |
| **Buttons** | Basic labels | Color-coded by action type (green=positive, red=destructive, blue=info, gray=cancel) |
| **Menus** | Plain labels | Add emoji to every menu option, descriptions for clarity |
| **Modlog** | Simple embeds | Color-coded by action type, thumbnail of actor, rich fields |
| **Help Command** | Basic list | Category-based browsing with subcommand trees, interactive navigation |
| **DM Messages** | Plain transcripts | Premium branding on all DMs (rating requests, transcripts) |
| **Loading States** | None | Add "Processing..." embeds with spinning emoji for async operations |
| **Confirmation Dialogs** | Basic yes/no | Rich confirmation with action summary, consequences, timeout warning |

---

## 13. Code Quality & Architecture Improvements

| Area | Suggestion |
|------|-----------|
| **Error handling** | Wrap all event handlers in try/catch, add `errorMessage` fallback for unknown errors |
| **Database abstraction** | Create a `dbHelper.js` that wraps common patterns (get-or-default, ensure-exists, atomic updates) |
| **Validation** | Add input validation helper for all user inputs (channel IDs, role IDs, numbers, strings) |
| **Constants** | Extract magic strings/numbers into a `constants.js` file |
| **Event cleanup** | Use `collector.on('end')` to clean up all message component collectors properly |
| **Rate limiting** | Add per-guild rate limiting on DB-heavy operations |
| **Logging levels** | Upgrade `client.logger` to support levels: debug, info, warn, error |
| **Service init** | Move service startup from `index.js` into a dedicated `serviceManager.js` |

---

## 14. Priority Roadmap

### Phase 1 — Critical (Do First)
1. Fix all 6 bugs
2. Add permission service + `/permissions` command
3. Add mod/staff role configuration to settings

### Phase 2 — High Value
4. Canned responses (`/canned`)
5. Ticket search/filter (`/ticket-search`)
6. Ticket tags (`/ticket-tag`)
7. Configurable auto-reply rules (`/faq-rules`)
8. Enhanced config command with more keys
9. Audit log service + command
10. Custom embed branding

### Phase 3 — Power Features
11. SLA service + breach alerts
12. Auto-assign service (round-robin)
13. Escalation service
14. Scheduled close + scheduled messages
15. Staff performance dashboard
16. Knowledge base
17. Ticket forwarding + merge
18. Ticket threads option

### Phase 4 — Advanced Automation
19. Duplicate detection
20. Webhook integrations
21. Verification gate
22. Alt account detection
23. Ticket message blacklist scanning
24. Rate limit per category
25. Staff shifts / availability

### Phase 5 — Polish & Expansion
26. Multi-language (i18n)
27. Web dashboard (Express + OAuth2)
28. Config backup/restore
29. FAQ search command
30. Welcome ticket for new members
31. Suggestion voting deadlines
32. Feedback follow-up DMs
33. Satisfaction trends charts
34. Giveaway + embed builder commands
35. Premium aesthetic overhaul on all embeds

---

*Each phase builds on the previous. Phase 1 fixes what's broken, Phase 2 adds the most impactful features, Phase 3 adds power features, Phase 4 adds automation, Phase 5 polishes everything to premium production level.*

**Total: 6 bug fixes, 12 new services, 35+ new commands, 5-tier permission system, premium aesthetic overhaul.**
