# Complete TeamSync collaboration workspace

Finish the protected project workspace so every existing navigation link opens a working page, with realtime collaboration throughout.

## Chat and attachments
- Add the project channel route with a realtime message feed, channel heading, member presence, grouped message rows, profile avatars, and discipline badges.
- Compose the transcript and composer from the supported AI Elements conversation, message, prompt-input, and attachment primitives, while preserving TeamSync’s compact dark visual system.
- Render message text as GitHub-flavored Markdown with syntax-highlighted fenced code blocks and copy controls.
- Support sending text, uploading image/document attachments, previewing selected files before send, opening completed attachments, and clear upload/error states.
- Add emoji reactions with compact counts and per-user toggling; reaction and message updates appear live without refresh.
- Keep the feed pinned intelligently to new messages while preserving a reader’s position when reviewing older messages.

## Kanban board
- Add the Board route with Backlog, In Progress, In Review, and Done columns.
- Support creating tasks with title, description, priority, due date, and assignee.
- Use drag-and-drop to move and reorder cards, persist positions, and refresh changes live for all project members.
- Show priority, assignee, and due-date indicators in a compact, scannable layout.

## Milestones
- Add the Milestones route with creation controls, live countdowns, descriptions, and completion progress.
- Support adding deliverables and checking them complete; synchronize milestone and checklist changes live.

## Team
- Add the Team route with online presence, member profiles, discipline badges, and owner/member roles.
- Let the project owner invite an existing account by email using the existing protected invitation function, with clear success and error feedback.

## Backend and security
- Add protected message-attachment and emoji-reaction records with explicit grants, row-level access limited to project members, indexes, and realtime publication.
- Configure private file storage for project chat attachments, with membership-scoped upload/read/delete rules and file metadata linked to messages.
- Keep all task, milestone, deliverable, reaction, and attachment writes subject to the existing project membership rules.

## Integration and validation
- Add unique page metadata for each new content route and the existing authenticated content pages that currently lack it.
- Keep all route IDs aligned with the existing TanStack file routing structure and preserve the current shared project shell.
- Validate the complete signed-in flow in the browser: open a project, send formatted chat, upload a file, react, move a task, update a deliverable, and invite a member.
- Run the project’s full build and lint checks, then verify desktop and narrow-screen layouts for overflow, readable contrast, and stable controls.

## Technical details
- Extend the generated database types after applying the migration so queries remain strongly typed.
- Reuse the existing query cache and `useRealtime` teardown pattern; add subscriptions for attachments and reactions.
- Use the existing authenticated client for member-scoped operations and the established server function for private email lookup.
- Default attachment policy: common images, PDF, plain text, and common archive/source files up to 10 MB each; files remain private to project members.
