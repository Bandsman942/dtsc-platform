# Calendar UI rules

These rules extend the root `AGENTS.md` for `components/calendar/**`.

- `Mon planning` must visually separate recurring weekly availability, dated exceptions and absences. Do not return to a single mixed status form for new DTSC work-schedule UX.
- Use the reusable workspace hierarchy (`ModuleWorkspace -> ModuleSection -> BusinessList -> detail/dialog`) and keep section, list, metadata and actions visually distinct.
- On mobile, long schedule forms use the existing high/fullscreen dialog behavior and preserve iOS keyboard, safe-area and opaque bottom-navigation fixes.
- A collaborator sees edit/copy/delete actions only for their own schedule. Team views are read-only and must not render edit/delete actions for another collaborator.
- Always state or preserve the product distinction `Disponibilité ≠ temps réellement travaillé` in planning UX.
- Do not expose sensitive absence reasons in collective views. Keep operational type/status separate from private detail.
- Do not add Sprint 4 prestation validation or Sprint 5 payroll actions to the calendar UI.
