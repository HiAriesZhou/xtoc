# Feature map

Primary surface: built Chrome extension, using the local HTTPS X fixture. Secondary surface: the Next.js website.

| Journey | Reference | Automation status |
| --- | --- | --- |
| Select, save, reload, view clip | [Clips](clips.md) | `verify.cjs run` |
| Popup headings and pinned panel | [Navigation](navigation.md) | Additional browser journey; not proven by clip run |
| Edit, export, delete clips | [Library](library.md) | Additional browser journey; clip run proves rendering only |
| Landing, video and navigation | [Website](website.md) | Additional browser journey; not extension proof |
