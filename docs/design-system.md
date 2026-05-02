# Design System

Visual language, tokens, component patterns, and rationale.

---

## Approach

A token-driven theme on top of **shadcn/ui + Tailwind**. shadcn components are copied into the repo as code, not installed as a black-box dependency, so anything can be adapted without vendor lock-in. Tailwind utility classes are a shared language any contributor can read without context-switching to a CSS file.

The system is intentionally small: one accent color, four semantic colors, eight spacing values, four radii, three shadow elevations, seven type sizes. Restraint reads as intentional.

---

## Tokens

### Color

CSS custom properties for both light and dark mode, consumed by Tailwind via `tailwind.config.ts`. Components only reference semantic tokens — never raw hex values.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 13% 11%;
  --muted: 210 14% 95%;
  --muted-foreground: 220 9% 46%;
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --ring: 222 47% 51%;

  --primary: 222 47% 11%;
  --primary-foreground: 210 20% 98%;

  --accent: 36 100% 50%;
  --accent-foreground: 222 13% 11%;

  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --destructive: 0 72% 51%;
  --info: 210 90% 56%;

  --radius: 0.5rem;
}

.dark {
  --background: 222 14% 6%;
  --foreground: 210 20% 98%;
  --muted: 222 14% 12%;
  --muted-foreground: 220 9% 65%;
  --border: 222 14% 16%;
  --input: 222 14% 14%;
  --ring: 36 100% 60%;

  --primary: 210 20% 98%;
  --primary-foreground: 222 13% 11%;

  --accent: 36 100% 60%;
  --accent-foreground: 222 14% 6%;
}
```

Rules:

- Body backgrounds use `bg-background`. Never `bg-white` / `bg-black` directly.
- Text uses `text-foreground` for primary content, `text-muted-foreground` for secondary.
- Borders use `border-border`. No custom grays.
- The accent is reserved for the primary CTA on each screen, the active step indicator, and high-confidence AI chips. Sparing use keeps it meaningful.
- Semantic colors (success / warning / destructive / info) are used only for state, never for decoration.

### Typography

```ts
fontSize: {
  xs:   ['0.75rem',  { lineHeight: '1rem'    }],
  sm:   ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem',     { lineHeight: '1.5rem'  }],
  lg:   ['1.125rem', { lineHeight: '1.75rem' }],
  xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
  '2xl':['1.5rem',   { lineHeight: '2rem'    }],
  '3xl':['2rem',     { lineHeight: '2.5rem'  }],
}
```

- Font: Inter via `next/font` (variable, self-hosted).
- Tabular figures (`font-variant-numeric: tabular-nums`) on the unit table and any numeric display, so values align column-wise.
- Headings: `font-semibold` for `h1`/`h2`, `font-medium` for `h3`. No `font-bold`.
- Default body size is `text-sm` for dense screens; `text-base` in forms; `text-xs` in metadata.

### Spacing

The 4px base scale: `2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`. Spacing not on this scale should be considered a bug.

- Card padding: `p-6` desktop, `p-4` mobile.
- Sibling cards: `gap-4`.
- Sections: `gap-12` desktop.
- Form rhythm: `gap-2` between label and input, `gap-6` between fields.

### Radius

`sm: 4`, `md: 8`, `lg: 12`, `xl: 16`. `md` is the default for buttons, inputs, cards. `lg` for dialogs and the assistant panel. Never `rounded-full` except on avatars and confidence chips.

### Shadow

Three levels:

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

`sm` on hovered cards, `md` on dropdowns and combobox results, `lg` on dialogs and the assistant panel. The dashboard table has no shadow — it relies on borders.

---

## Component patterns

### Buttons

Three variants: `default` (primary action), `outline` (secondary), `ghost` (tertiary, in toolbars). Sizes `sm`, `default`, `lg`. Icon-only buttons have `aria-label` and an `<span class="sr-only">`. Loading state shows an inline spinner _and_ keeps the label visible — no width jumps.

### Forms

- Label above the field.
- Help text below in `text-muted-foreground text-xs`.
- Errors in `text-destructive text-xs` below the field, associated via `aria-describedby`.
- Required marker: red asterisk after the label, with `aria-required="true"`.
- Disabled state: `opacity-60`, no pointer.
- Inline validation triggers on blur, not on every keystroke.

### Tables

The unit table is the most important component in the product. Pattern:

- Sticky header.
- Sticky first column (unit number) on horizontal scroll.
- Row hover: `bg-muted/50`.
- Active cell: 2px ring in accent.
- Invalid cell: 1px destructive border + tooltip on hover.
- Selected row: leading checkbox column highlights blue.
- Empty state: full-width row with icon, headline, "Add unit" CTA.

### Cards

`border border-border bg-background rounded-md p-6`, no shadow at rest. Hover lifts to `shadow-sm`. Active card adds an accent ring.

### Dialogs

Backdrop blur (`backdrop-blur-sm bg-background/80`). Slide+fade in from center over 200ms ease-out. Trapped focus. Esc to close, click outside to close (with confirmation if dirty). Title at top, primary action bottom-right, secondary action bottom-left.

### Toasts

Bottom-right, stack vertically, max 3 visible. Auto-dismiss after 5 s for info/success, sticky for destructive. Each toast has a colored left border indicating type.

### Chips

- Property type: `WEG` (blue subtle), `MV` (purple subtle).
- AI confidence: high (green), medium (amber), low (red), with the numeric % visible on hover.
- Status: muted background, semibold text.

### Step indicator

Horizontal pill on desktop, three steps with a connecting line. Active step accent fill. Completed step success fill with check icon. Pending step muted. Click on completed step navigates back; pending steps not clickable.

### Empty states

Every list, drawer, and nested table has a hand-crafted empty state: small lucide icon (rounded background, accent), one-line headline, one-line description, primary CTA. No generic "no data" fallback text.

### Loading skeletons

Match the layout of the resolved state. Pulse animation 1.5s ease-in-out infinite. Not used for sub-300ms loads.

---

## Motion

Three durations: fast (150ms), medium (250ms), slow (400ms). Easing: `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for moves.

Concrete uses:

- Wizard step transition: outgoing fades + 4px translate-x; incoming fades + translate-x from the opposite side. Under 200ms total.
- Toast entrance: slide + fade up.
- Save button: spinner morphs to check.
- AI extraction loading: soft pulsing accent ring on the upload card.
- Assistant panel: slide-in from right with backdrop blur fade.

All motion respects `prefers-reduced-motion: reduce` — fades only, no translations.

---

## Accessibility minimums

- Contrast: WCAG AA — `4.5:1` body, `3:1` large text. Verified in both light and dark.
- Keyboard: every interaction reachable; focus ring always visible.
- ARIA: dialogs use `role="dialog"`; errors use `aria-describedby`; icon-only buttons use `aria-label`.
- Forms: every input paired with a `<label htmlFor>`. Errors associated programmatically.
- Tables: proper `<th scope="col">`; captioned via `<caption>` or `aria-labelledby`.
- Live regions: AI extraction status, save status, toast messages — announced via `role="status"` or `aria-live="polite"`.
- Touch targets: ≥ 44px × 44px on mobile.

`axe-core` runs as part of the unit test suite and reports zero violations on every screen tested.

---

## Responsive layout

Breakpoints follow Tailwind defaults: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.

- Default is mobile; desktop layouts are progressive enhancements.
- Wizard: side-by-side on desktop where applicable; stacked with sticky bottom action bar on mobile.
- Unit table on mobile collapses to a card-per-unit list with an "Open table view" CTA that opens a fullscreen modal containing the desktop table — preserving the bulk-entry experience for tablet and landscape phone use.
- Step indicator: horizontal on `md+`, compact dots on `sm`.
- Assistant panel: right-aligned drawer on `md+`, fullscreen sheet on `sm`.

---

## Iconography

`lucide-react` exclusively. 16px in dense UI, 20px in primary buttons, 24px in empty-state framing. Stroke width 1.5. Color matches text — never decorative.

Common icons: `Plus`, `Trash2`, `Copy`, `Edit3`, `Check`, `X`, `ChevronRight`, `Upload`, `FileText`, `Sparkles` (AI), `MessageSquare` (chat), `AlertTriangle`, `ChevronUp`, `ChevronDown`, `Search`.

---

## Tone of voice

- Concise. Headlines under 8 words, descriptions under 16.
- Imperative for actions: "Create property," "Upload document," "Generate units."
- No marketing language. The audience is professional property managers; respect their time.
- German domain terms preserved alongside English clarification on first occurrence: "Teilungserklärung (declaration of division)."
- Errors specific and actionable: "MEA total exceeds 1000.0. Reduce one or more shares." Not "Invalid input."

---

## Localization

The product is bilingual. Default locale is **`de`**, fallback **`en`**, both shipped on day one via `next-intl`. Routing flows through a `[locale]` segment; locale is persisted in a cookie and reflected in the URL.

- **Catalogs** — `messages/en.json` and `messages/de.json`. Namespaces: `common`, `dashboard`, `wizard`, `units`, `extraction`, `errors`, `chat`. No raw string literals in JSX or `aria-label` — every user-facing string is `t('namespace.key')`.
- **Domain terms stay German in both locales.** WEG, MV, MEA, Teilungserklärung, Miteigentumsanteile, Wohnfläche, Nutzfläche, Tiefgaragenstellplatz, Erdgeschoss, Obergeschoss, Untergeschoss — these are legal terms with no English equivalent. English copy clarifies them in tooltip on first appearance ("Teilungserklärung (declaration of division)") and otherwise treats them as proper nouns.
- **Numbers and dates** flow through `next-intl` formatters. German: `1.234,56 m²`, `15.03.2024`. English: `1,234.56 m²`, `Mar 15, 2024`. Form inputs accept both formats and store canonical (period decimal, ISO date).
- **Locale switcher** lives top-right next to the dark-mode toggle. A small flag-less label (`DE` / `EN`) flips the locale, persists the cookie, and re-renders without a hard navigation.
- **Validation messages** are localized through `zod-i18n-map` so errors arrive in the user's language, not English-only Zod defaults.
- **Error pages** (`error.tsx`, `not-found.tsx`, `global-error.tsx`) localized; `global-error.tsx` ships both copy variants inline since it can't depend on the i18n provider.
