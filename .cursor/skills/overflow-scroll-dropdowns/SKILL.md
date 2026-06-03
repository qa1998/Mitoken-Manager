---
name: overflow-scroll-dropdowns
description: Fix dropdown/combobox menus clipped inside overflow:auto/hidden containers (tables, modals, scroll panels). Use when a picker menu is cut off, hidden behind siblings, or pushed under footer/actions — especially quote-product-picker, table row selects, modal nested lists.
---

# Overflow-scroll dropdowns

## Problem

`position:absolute` dropdowns inside `overflow:auto` or `overflow:hidden` parents are **clipped**. Raising `z-index` alone does not fix it.

Common in this project:
- `.quote-lines-table-wrap { overflow: auto }` — quote create/edit product picker
- `.quote-create-body`, `.modal-body` — nested scroll in modals
- `.customer-table-wrap { overflow-x: auto }` — product/customer list action menus (CSS makes `overflow-y` behave as `auto` too)
- Bootstrap `.table { border-collapse: collapse }` — **`z-index` on `<tr>` often fails**; rows below paint over the dropdown

## Fix pattern (preferred)

Use **fixed positioning while open**; anchor to trigger via `getBoundingClientRect()`.

### CSS

```css
.picker-menu.is-floating {
  position: fixed;
  z-index: 1090; /* above Bootstrap modal (1055) */
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.picker-menu.is-floating .picker-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-height: none;
}
table tbody td { overflow: visible; }
tbody tr:has(.picker-menu.open) { position: relative; z-index: 10; }
```

### JS

1. On open: add `.open` + `.is-floating`, set `top`/`left`/`width`/`max-height` from anchor rect; flip upward if space below is tight.
2. On close: remove classes and inline styles (`dock*` helper).
3. On scroll/resize (window + scroll parents): reposition or close.
4. `menu.addEventListener('click', e => e.stopPropagation())` so document click handler does not instantly close.
5. Do **not** rely on `overflow: visible` on the scroll wrapper alone — it breaks table scrolling.

### Bootstrap dropdowns in tables

Use Popper **`strategy: 'fixed'`** (not just higher `z-index`):

```javascript
// static/js/app.js — initTableDropdowns()
new bootstrap.Dropdown(toggle, { popperConfig: { strategy: 'fixed' } });
```

Or on the toggle: `data-bs-popper-config='{"strategy":"fixed","placement":"bottom-end"}'`.

Also: `.table-actions-cell.is-dropdown-open { z-index: 200 }` and parent `:has(.dropdown.show) { overflow: visible }`.

### Custom picker menus (non-Bootstrap)

`static/js/quotes.js` — `positionProductPickerMenu`, `dockProductPickerMenu`, `bindProductPickerScrollListeners`.

## Checklist for new pickers

- [ ] Menu escapes scroll container (`is-floating` + fixed coords)
- [ ] `z-index` above modal layer
- [ ] Reposition on scroll/resize
- [ ] Clean up listeners/styles on close
- [ ] Stop propagation on menu clicks
- [ ] Test inside modal + table with multiple rows + narrow viewport

## Avoid

- Only bumping `z-index` without fixing overflow clipping
- Setting parent `overflow: visible` permanently on scroll areas (loses scroll containment)
- Appending menu to `body` without wiring close/reposition back to the row (unless you also store picker reference)
