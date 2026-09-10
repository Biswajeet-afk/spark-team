# TeamSync — collaboration hub for university project teams

A dark, developer-focused workspace where multidisciplinary teams chat in channels, track tasks on a Kanban board, and count down to project milestones.

## What gets built

**Sign in and profiles**
- Email/password plus Google sign-in.
- Each member has a name, avatar, short bio, and a discipline badge (Engineering, Design, Business, Data, Research, Other) shown next to every message.

**Projects and channels**
- Create a project (team/hackathon), invite members by email address, see the member roster with discipline badges.
- Text channels per project (#general, #standup, plus any the team adds).

**Chat**
- Live messages that appear instantly for everyone in the channel.
- Markdown formatting and fenced code blocks with syntax highlighting and a copy button.
- Presence indicator showing who is currently online.

**Tasks (Kanban)**
- Columns: Backlog, In Progress, In Review, Done.
- Drag cards between columns; each task has title, description, assignee, priority, and due date.
- Updates appear live for everyone.

**Milestones**
- Milestone list with a live countdown timer to each due date.
- Deliverables checklist per milestone with a progress bar.

**Look and feel**
- Dark-first interface inspired by Linear and Discord: near-black surfaces, a single vivid accent, compact typography, subtle borders, keyboard-friendly navigation.
- Left sidebar for projects/channels, main panel for chat/board/milestones.

## Technical notes

- Lovable Cloud (Supabase) for auth, Postgres, and Realtime.
- Tables: `profiles`, `projects`, `project_members`, `channels`, `messages`, `tasks`, `milestones`, `deliverables`. Enum types for discipline, task status, priority.
- RLS on every table, scoped through a `is_project_member(project_id, user_id)` security-definer function; grants issued per table. Trigger auto-creates a profile on signup and seeds `#general` on project creation.
- Realtime subscriptions on `messages`, `tasks`, `milestones`, `deliverables`; presence channel per project.
- Routes: `/` public landing with sign-in CTA, `/auth`, and gated `/app` shell with `/app/p/$projectId/{chat/$channelId, board, milestones, team}`.
- Reads/writes through TanStack Start server functions with `requireSupabaseAuth`, plus browser client for realtime.
- Markdown via `react-markdown` + `remark-gfm` and `shiki`/`highlight.js` for code blocks; drag-and-drop via `@dnd-kit`.
- Design tokens in `src/styles.css`; no hardcoded colors.

## Build order

1. Enable Cloud, run schema + RLS migration.
2. Design system, app shell, auth flow, profiles.
3. Projects, members, channels.
4. Realtime chat with markdown/code.
5. Kanban board.
6. Milestones with countdown and deliverables.
