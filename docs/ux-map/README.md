# UX map

A machine-readable inventory of every screen, for the UX overhaul. One JSON file per area (`<area>.json`), plus
`index.json` (areas, files, the global shell). Built from the code, not from screenshots: labels are the German texts
from `src/i18n/messages/de.json` (with the key), routes as in the App (without `/app`).

## Shape of `<area>.json`

```jsonc
{
  "area": "contacts",                       // nav key from src/modules/nav.ts
  "label": "Kontakte",
  "module": "crm",                          // module that must be on (null = core)
  "nav": [{ "label": "Übersicht", "href": "/contacts" }],   // sidebar entries in order
  "pages": [
    {
      "route": "/contacts/[id]",
      "file": "src/app/(app)/contacts/[id]/page.tsx",
      "title": "Kontakt (Name)",
      "purpose": "One sentence: what the person does here.",
      "permission": "crm.view",             // requirePerm / ctx.can on the page
      "size": "list | record | form",       // <Page size>
      "header": {
        "crumbs": ["Kontakte", "<Name>"],
        "badge": "…", "meta": "…",
        "settings": "/contacts/settings",
        "actions": [], "menu": [], "primary": { "label": "Neuer Kontakt", "href": "/contacts/new", "more": [] }
      },
      "urlState": [{ "param": "q", "meaning": "search" }],
      "sections": [
        {
          "title": "Adresse", "anchor": "#address",
          "kind": "FormCard | DetailList | DataTable | Board | Calendar | Timeline | ActivityFeed | FileList | custom",
          "fields": [{ "name": "street", "label": "Straße", "key": "contacts.street", "type": "text", "component": "Input | TypedInput:iban | Choice | DateInput | RichTextEditor | TagSelect | ContactPicker | …", "required": false, "notes": "" }],
          "columns": ["Name", "E-Mail"]      // for tables
        }
      ],
      "actions": [
        {
          "label": "Löschen", "where": "header | menu | toolbar | row | section | savebar | sheet | bulk",
          "kind": "link | serverAction | sheet | confirm | download | client",
          "target": "/contacts/[id]/edit | ?edit=<id> | deleteContact (actions.ts)",
          "permission": "crm.manage", "confirm": true,
          "result": "Where the person lands / what changes / which toast"
        }
      ],
      "overlays": [
        { "param": "?edit=<id>", "component": "UrlSheet", "title": "…", "fields": [], "actions": [] }
      ],
      "links": ["/contacts", "/members/[id]"],   // other routes reachable from here
      "empty": "EmptyState text, if any",
      "phone": "What differs on phones (cards instead of table, round + button, …)",
      "uxNotes": ["Factual observations for the overhaul: inconsistencies, dead ends, too many fields, missing feedback, duplicated paths"]
    }
  ]
}
```

Rules: every page.tsx under the area is listed; components the page renders (forms, drawers, client parts) are
followed to list their fields and actions; nothing is guessed: unknown = omitted.
