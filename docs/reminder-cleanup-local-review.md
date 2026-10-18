# Reminder cleanup: local review

Compare screenshots at `http://localhost:5173/local-review/reminders/index.html`. The comparison has Events and Notifications views, links to full-size screenshots, and links to the live local pages.

- Events: removed the install/QR promotion and replaced it with a compact Manage reminders link. Existing timezone explanations and offset controls remain available under expandable Event time settings. Event calculations and cards are unchanged.
- Profile notifications: Telegram and Discord delivery cards sit above a full-width event list. Browser-push controls, install instructions and device diagnostics are absent from this profile view.
- New subscriptions/tests initiated from Profile use Telegram/Discord only. The raw stored browser-push preference is preserved. The standalone `/event-reminders` route and its push behavior remain available; existing subscriptions were not migrated or deleted.
- This is a local layout and interaction preview. Account-based notification migration and retirement of the standalone app remain separate work. No actual Telegram or Discord messages were sent.

Validation: browser checked both pages and the comparison view. Local delivery checks verify Profile omits push while standalone retains it, without mutating the original delivery preference. The reminder catalog still includes all 36 S-weapon entries and excludes the 24 non-S weapon entries. Typecheck remains at the same 48 existing errors after normalizing shifted line numbers; no additional errors were introduced.

No push or deployment was performed. Screenshots and the comparison page are local review artifacts under `public/local-review/reminders`; exclude these review artifacts from a future production release.
