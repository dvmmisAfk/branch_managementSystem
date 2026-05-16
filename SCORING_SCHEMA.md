# Scoring Section — Full Schema, Wireframe & Formulae

> **Source of truth:** generated from live codebase on 2026-05-16.
> Covers all four scoring tables, the score lifecycle, calculation formulae,
> category versioning, UI wireframes, PDF and Excel structures, API endpoints,
> and known bugs.

---

## 1. Database Tables (DDL)

### 1.1 `assessment_categories`

```sql
CREATE TABLE "assessment_categories" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"           VARCHAR(100) NOT NULL,
    "display_order"  INTEGER      NOT NULL,
    "weight_percent" DECIMAL(5,2),          -- optional; not used in live scoring formula
    "max_points"     INTEGER,               -- optional metadata
    "version"        INTEGER      NOT NULL DEFAULT 1,
    "effective_from" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "is_active"      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT "assessment_categories_pkey" PRIMARY KEY ("id")
);
```

| Column           | Type         | Nullable | Notes                                        |
|------------------|--------------|----------|----------------------------------------------|
| `id`             | UUID         | NO       | PK, auto-generated                           |
| `name`           | VARCHAR(100) | NO       | Display name (e.g. "Safety & Security")      |
| `display_order`  | INTEGER      | NO       | Ascending sort order in UI and PDF           |
| `weight_percent` | DECIMAL(5,2) | YES      | Stored but not used in score calculation      |
| `max_points`     | INTEGER      | YES      | Metadata only                                |
| `version`        | INTEGER      | NO       | Increments on each PATCH (versioning)        |
| `effective_from` | TIMESTAMPTZ  | NO       | Timestamp of this version's creation         |
| `is_active`      | BOOLEAN      | NO       | FALSE on superseded versions                 |

---

### 1.2 `assessment_subcategories`

```sql
CREATE TABLE "assessment_subcategories" (
    "id"                     UUID    NOT NULL DEFAULT gen_random_uuid(),
    "category_id"            UUID    NOT NULL,
    "name"                   TEXT    NOT NULL,
    "description"            TEXT,
    "max_score"              INTEGER NOT NULL DEFAULT 5,
    "weight_within_category" DECIMAL(5,2),
    "display_order"          INTEGER NOT NULL,
    "is_active"              BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT "assessment_subcategories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_subcategories_category_id_display_order_key"
        UNIQUE ("category_id", "display_order"),
    CONSTRAINT "assessment_subcategories_category_id_fkey"
        FOREIGN KEY ("category_id")
        REFERENCES "assessment_categories"("id") ON DELETE CASCADE
);
```

| Column                   | Type         | Nullable | Notes                                             |
|--------------------------|--------------|----------|---------------------------------------------------|
| `id`                     | UUID         | NO       | PK                                                |
| `category_id`            | UUID         | NO       | FK → `assessment_categories.id`                   |
| `name`                   | TEXT         | NO       | Measurable point label                            |
| `description`            | TEXT         | YES      | Checklist/checkpoint text shown in UI and PDF     |
| `max_score`              | INTEGER      | NO       | Default 5; upper bound for `score_given`          |
| `weight_within_category` | DECIMAL(5,2) | YES      | Stored but not used in score calculation          |
| `display_order`          | INTEGER      | NO       | Unique per category; controls row order           |
| `is_active`              | BOOLEAN      | NO       | Deactivated rows are invisible in live category   |

---

### 1.3 `visit_scores`

```sql
CREATE TABLE "visit_scores" (
    "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
    "visit_id"       UUID          NOT NULL,
    "subcategory_id" UUID          NOT NULL,
    "status"         "ScoreStatus" NOT NULL,   -- enum: yes / no / not_applicable
    "score_given"    INTEGER,
    "max_score"      INTEGER       NOT NULL,
    "observations"   TEXT,
    "rems_number"    VARCHAR(100),
    "remarks"        TEXT,
    CONSTRAINT "visit_scores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visit_scores_visit_id_subcategory_id_key"
        UNIQUE ("visit_id", "subcategory_id"),
    CONSTRAINT "visit_scores_visit_id_fkey"
        FOREIGN KEY ("visit_id")
        REFERENCES "branch_visits"("id") ON DELETE CASCADE,
    CONSTRAINT "visit_scores_subcategory_id_fkey"
        FOREIGN KEY ("subcategory_id")
        REFERENCES "assessment_subcategories"("id") ON DELETE RESTRICT
);
```

| Column          | Type        | Nullable | Notes                                                     |
|-----------------|-------------|----------|-----------------------------------------------------------|
| `id`            | UUID        | NO       | PK                                                        |
| `visit_id`      | UUID        | NO       | FK → `branch_visits.id` (CASCADE delete)                  |
| `subcategory_id`| UUID        | NO       | FK → `assessment_subcategories.id` (RESTRICT delete)      |
| `status`        | ScoreStatus | NO       | `yes` / `no` / `not_applicable`                           |
| `score_given`   | INTEGER     | YES      | NULL when status = `not_applicable`; must be ≤ `max_score`|
| `max_score`     | INTEGER     | NO       | Snapshot of subcategory's `max_score` at visit creation   |
| `observations`  | TEXT        | YES      | Free-text observations by SFH                             |
| `rems_number`   | VARCHAR(100)| YES      | REMS ticket reference                                     |
| `remarks`       | TEXT        | YES      | Free-text remarks by SFH                                  |

**Important:** `ON DELETE RESTRICT` on `subcategory_id` prevents hard-deletion of any
subcategory that has been scored at least once. Use `is_active = false` to retire them.

---

### 1.4 `score_snapshots`

```sql
CREATE TABLE "score_snapshots" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    "visit_id"            UUID        NOT NULL UNIQUE,
    "total_points_earned" INTEGER     NOT NULL,
    "total_max_points"    INTEGER     NOT NULL,
    "score_percentage"    DECIMAL(5,2) NOT NULL,
    "score_band"          "ScoreBand" NOT NULL,
    "category_breakdown"  JSONB       NOT NULL,
    "calculated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "score_snapshots_visit_id_fkey"
        FOREIGN KEY ("visit_id")
        REFERENCES "branch_visits"("id") ON DELETE CASCADE
);
```

| Column               | Type         | Nullable | Notes                                                     |
|----------------------|--------------|----------|-----------------------------------------------------------|
| `id`                 | UUID         | NO       | PK                                                        |
| `visit_id`           | UUID         | NO       | FK → `branch_visits.id`; UNIQUE (one snapshot per visit)  |
| `total_points_earned`| INTEGER      | NO       | Sum of `earned_i` across all non-NA rows                  |
| `total_max_points`   | INTEGER      | NO       | Sum of `max_score_i` across all non-NA rows               |
| `score_percentage`   | DECIMAL(5,2) | NO       | `round(earned×10000/max)/100`; serialised as string in JSON|
| `score_band`         | ScoreBand    | NO       | Derived from percentage thresholds                        |
| `category_breakdown` | JSONB        | NO       | `{ [categoryName]: { earned, max, pct } }`                |
| `calculated_at`      | TIMESTAMPTZ  | NO       | Timestamp of last recalculation                           |

`category_breakdown` shape:
```json
{
  "Safety & Security": { "earned": 18, "max": 25, "pct": 72.00 },
  "Housekeeping":      { "earned": 14, "max": 15, "pct": 93.33 }
}
```

---

## 2. Enums

### `ScoreStatus`
| Value            | Meaning                                 |
|------------------|-----------------------------------------|
| `yes`            | Compliant / item observed               |
| `no`             | Non-compliant / item not observed       |
| `not_applicable` | Item skipped; excluded from scoring     |

### `ScoreBand`
| Value               | Threshold            |
|---------------------|----------------------|
| `excellent`         | ≥ 90%                |
| `good`              | ≥ 80% and < 90%      |
| `satisfactory`      | ≥ 70% and < 80%      |
| `needs_improvement` | ≥ 60% and < 70%      |
| `critical`          | < 60%                |

### `IssueStatus`
| Value        | Meaning              |
|--------------|----------------------|
| `open`       | Not yet resolved     |
| `in_progress`| Work in progress     |
| `resolved`   | Closed / resolved    |

---

## 3. Entity Relationship Diagram (ERD)

```
┌──────────────────────┐   1    ┌────────────────────────────┐
│  assessment_         │──────<│  assessment_               │
│  categories          │        │  subcategories             │
│──────────────────────│        │────────────────────────────│
│ id (PK)              │        │ id (PK)                    │
│ name                 │        │ category_id (FK)           │
│ display_order        │        │ name                       │
│ weight_percent       │        │ description                │
│ max_points           │        │ max_score                  │
│ version              │        │ weight_within_category     │
│ effective_from       │        │ display_order              │
│ is_active            │        │ is_active                  │
└──────────────────────┘        └────────────────────────────┘
                                           │
                                           │ 1
                                           ▼
                               ┌────────────────────────────┐
             ┌─────────────────│     visit_scores           │
             │                 │────────────────────────────│
             │                 │ id (PK)                    │
             │                 │ visit_id (FK)              │
             │                 │ subcategory_id (FK/RESTRICT)│
             │                 │ status (ScoreStatus)       │
             │                 │ score_given                │
             │                 │ max_score                  │
             │                 │ observations               │
             │                 │ rems_number                │
             │                 │ remarks                    │
             │                 └────────────────────────────┘
             │ many
┌────────────────────────────┐  1   ┌────────────────────────────┐
│     branch_visits          │──────│    score_snapshots         │
│────────────────────────────│      │────────────────────────────│
│ id (PK)                    │      │ id (PK)                    │
│ branch_id (FK)             │      │ visit_id (FK, UNIQUE)      │
│ sfh_id (FK)                │      │ total_points_earned        │
│ quarter_id (FK)            │      │ total_max_points           │
│ is_submitted               │      │ score_percentage           │
│ ...snapshot fields...      │      │ score_band                 │
└────────────────────────────┘      │ category_breakdown (JSONB) │
                                    │ calculated_at              │
                                    └────────────────────────────┘
```

---

## 4. Score Lifecycle

```
VISIT CREATED (draft)
│
│  createVisitDraft()
│  └─ For each active subcategory → creates one visit_score row:
│       status    = 'yes'  (default, editable)
│       score_given = NULL
│       max_score = subcategory.max_score  ← snapshot taken at creation time
│
├─ SFH edits scores  PUT /visits/:id/scores
│    └─ Validates + updates status, score_given, observations, rems_number, remarks
│    └─ Calls recalculateScoreSnapshotForVisit()
│         └─ Upserts score_snapshots with new totals + band
│
├─ SFH continues editing (any number of saves)
│    └─ Each save triggers recalculation and snapshot upsert
│
└─ SFH submits  POST /visits/:id/submit
     └─ Sets is_submitted = true, submittedAt = NOW()
     └─ Snapshot is already current at submission time
```

**Key invariant:** `score_snapshots` is always in sync with `visit_scores` because every
write to `visit_scores` immediately triggers `recalculateScoreSnapshotForVisit`.

---

## 5. Scoring Parameters

### Per `visit_scores` row — input fields (SFH-editable)

| Field          | Required            | Constraint                                   |
|----------------|---------------------|----------------------------------------------|
| `subcategoryId`| YES                 | Must match an existing score row for the visit|
| `status`       | YES                 | `yes` / `no` / `not_applicable`              |
| `scoreGiven`   | If status ≠ NA      | Integer 0–`max_score`; NULL if NA            |
| `observations` | NO                  | Free text                                    |
| `remsNumber`   | NO                  | REMS ticket string                           |
| `remarks`      | NO                  | Free text                                    |

### System-set fields (not editable by SFH)

| Field      | Set by                | Notes                                             |
|------------|-----------------------|---------------------------------------------------|
| `maxScore` | `createVisitDraft()`  | Snapshot of subcategory `max_score` at creation   |
| `visitId`  | Visit creation        | Fixed; cannot be changed                          |

---

## 6. Calculation Formulae

### 6.1 Per-row earned score

```
if status == 'not_applicable':
    row is excluded from all totals (no contribution to earned or max)

else:
    earned_i = min(score_given_i, max_score_i)
```

### 6.2 Aggregate totals

```
earnedTotal = Σ earned_i    for all non-NA rows
maxTotal    = Σ max_score_i  for all non-NA rows
```

### 6.3 Score percentage (2-decimal precision, no floating-point drift)

```
if maxTotal == 0:
    scorePercentage = 0   ← Bug C-3: all-NA visits → 0% → "critical" band

else:
    scorePercentage = round( (earnedTotal × 10000) / maxTotal ) / 100
```

The `× 10000 / ... / 100` pattern avoids IEEE 754 rounding drift by doing
integer-level rounding first, then scaling back to percentage.

**Example:**
```
earnedTotal = 37,  maxTotal = 50
scorePercentage = round(37 × 10000 / 50) / 100
               = round(7400) / 100
               = 74.00
```

### 6.4 Category-level breakdown (same formula per category)

```
cat_pct = cat_max > 0 ? round((cat_earned × 10000) / cat_max) / 100 : 0
```

Stored in `score_snapshots.category_breakdown` JSONB.

### 6.5 Score band assignment

```typescript
function bandFromPct(pct: number): ScoreBand {
  if (pct >= 90) return "excellent";
  if (pct >= 80) return "good";
  if (pct >= 70) return "satisfactory";
  if (pct >= 60) return "needs_improvement";
  return "critical";
}
```

| Range         | Band                |
|---------------|---------------------|
| pct ≥ 90      | excellent           |
| 80 ≤ pct < 90 | good                |
| 70 ≤ pct < 80 | satisfactory        |
| 60 ≤ pct < 70 | needs_improvement   |
| pct < 60      | critical            |

---

## 7. Category Versioning

**Rule:** Category metadata changes (name, displayOrder, weightPercent, maxPoints)
are **non-destructive** — PATCH always creates a new version row, never mutates in place.

### PATCH `/categories/:id` flow

```
1. Load old category + all its active subcategories
2. Create NEW category row:
   - Applies requested field changes
   - version = old.version + 1,  is_active = true
   - Clones all active subcategories under the new category id
3. Transaction:
   - UPDATE assessment_subcategories SET is_active = false WHERE category_id = old.id
   - UPDATE assessment_categories    SET is_active = false WHERE id = old.id
4. Return new category with its new subcategory rows
```

**Why versioning:** `visit_scores.subcategory_id` uses `ON DELETE RESTRICT`, so old
subcategory rows can never be hard-deleted once scored. Versioning preserves historical
integrity while keeping the UI showing only the current active structure.

### Subcategory PATCH flow

```
1. Load old subcategory
2. Bump old row's display_order to (max_display_order + 10000) — frees the slot
3. Set old row is_active = false
4. Insert new subcategory row at same display_order with updated fields
```

---

## 8. UI Wireframe — Scores Tab

```
┌──────────────────────────────────────────────────────────────────┐
│  Visit detail — Scores tab                                       │
├──────────────────────────────────────────────────────────────────┤
│  SCORE SUMMARY CARD                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Overall Score                                            │  │
│  │  ┌──────────────────────┐  ┌───────────────────────────┐  │  │
│  │  │  74.00%              │  │  Band: SATISFACTORY badge  │  │  │
│  │  └──────────────────────┘  └───────────────────────────┘  │  │
│  │  37 / 50 points                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  CATEGORY BREAKDOWN TABLE                                        │
│  ┌───────┬────────────────────────────┬────────┬──────┬──────┐  │
│  │ S.No  │ Category                   │ Earned │ Max  │  %   │  │
│  ├───────┼────────────────────────────┼────────┼──────┼──────┤  │
│  │  1    │ Housekeeping               │  14    │  15  │  93% │  │
│  │  2    │ Safety & Security          │  18    │  25  │  72% │  │
│  │  ...  │ ...                        │  ...   │  ... │  ... │  │
│  ├───────┼────────────────────────────┼────────┼──────┼──────┤  │
│  │ TOTAL │                            │  37    │  50  │  74% │  │
│  └───────┴────────────────────────────┴────────┴──────┴──────┘  │
│                                                                  │
│  DETAIL — one collapsible panel per category                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ▾ Safety & Security                     18 / 25  (72%)   │  │
│  │  ┌──────┬─────────────────────┬──────────┬───────┬──────┐ │  │
│  │  │ S.No │ Measurable point    │ Status   │ Given │ Max  │ │  │
│  │  ├──────┼─────────────────────┼──────────┼───────┼──────┤ │  │
│  │  │  1   │ Fire ext. check     │ [YES ▼]  │  [4]  │   5  │ │  │
│  │  │      │  Observations:      │ [______] │       │      │ │  │
│  │  │      │  REMS no:           │ [______] │       │      │ │  │
│  │  │      │  Remarks:           │ [______] │       │      │ │  │
│  │  │  2   │ Emergency exit      │ [N/A ▼]  │  ---  │   5  │ │  │
│  │  └──────┴─────────────────────┴──────────┴───────┴──────┘ │  │
│  │  [Save scores]                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Status dropdown values:** Yes / No / N/A  →  `yes` / `no` / `not_applicable`

When status = N/A:
- `score_given` is cleared and locked to NULL
- Row is excluded from `earnedTotal` and `maxTotal`

---

## 9. Overview Panel — Score Section

The Overview/Edit tab shows the current snapshot inline:

```
┌─────────────────────────────────────────────────────┐
│  Branch Snapshot                                    │
│  ┌─────────────────┬───────────────────────────┐   │
│  │  Score          │  74.00%  SATISFACTORY  ■  │   │
│  │  Points         │  37 / 50                  │   │
│  └─────────────────┴───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

Score band badge colour mapping (Ant Design tokens):

| Band                | Ant Design colour | Visual         |
|---------------------|-------------------|----------------|
| `excellent`         | `success`         | Green          |
| `good`              | `processing`      | Blue           |
| `satisfactory`      | `warning`         | Yellow/amber   |
| `needs_improvement` | `warning`         | Orange         |
| `critical`          | `error`           | Red            |

---

## 10. PDF Wireframe — Scoring Sections

The visit report PDF is Puppeteer-rendered A4 HTML (25 mm side margins, 28 mm top, 18 mm bottom).

### Page 2 — Scoring Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [HEADER: Branch visit report · BRANCHCODE · Q1 FY2025 · generated at]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Scoring summary                                                        │
│  ┌────┬─────────────────────────────────┬───────┬───────┬──────┬─────┐ │
│  │ #  │ Measurable point                │ Points│ Max   │  %   │ Rmk │ │
│  ├────┼─────────────────────────────────┼───────┼───────┼──────┼─────┤ │
│  │  1 │ Housekeeping                    │  14   │  15   │ 93%  │     │ │
│  │  2 │ Safety & Security               │  18   │  25   │ 72%  │     │ │
│  │    │ Grand total                     │  37   │  50   │ 74%  │     │ │
│  └────┴─────────────────────────────────┴───────┴───────┴──────┴─────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                  Overall score                                │     │
│  │                  74.00%   (40px bold)                         │     │
│  │                  SATISFACTORY   (accent colour)               │     │
│  │         (gradient indigo card, 1.5pt accent border)           │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  [FOOTER: TATA MGMT · Branch visit report · Q1 FY2025 · Page 2 of N]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Bug C-1 / M-1:** Summary rows are sorted **alphabetically** by category name
(`Object.entries(jb).sort([a],[b]) => a.localeCompare(b)`), while detail sections
are sorted by `category.displayOrder`. If display order does not match alphabetical
order, the S.No values become inconsistent between the summary and detail pages.

### Pages 3+ — Per-Category Detail (one page per category, forced `page-break-before: always`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Safety & Security                                                      │
│  ┌────┬──────────────────────┬─────────────────┬──────┬──────┬───────┐ │
│  │ #  │ Measurable point     │ Check points    │ Stat │ Pts  │ Max   │ │
│  ├────┼──────────────────────┼─────────────────┼──────┼──────┼───────┤ │
│  │  1 │ Fire extinguisher    │ Check expiry... │ YES  │   4  │   5   │ │
│  │  2 │ Emergency exit       │ Ensure clear... │ N/A  │  --  │   5   │ │
│  └────┴──────────────────────┴─────────────────┴──────┴──────┴───────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

Full column list in per-category table:
1. S.No (sequential across ALL categories; continues from previous category)
2. Measurable point — `subcategory.name`
3. Check points — `subcategory.description`
4. Status — YES / NO / N/A pill badge
5. Observations — free text
6. REMS — ticket number
7. Points given — `score_given`
8. Max — `max_score`
9. Remarks by SFH

---

## 11. Excel Workbook Structure — Scores Sheet

The Excel download (`GET /visits/:id/excel`) produces a multi-sheet `.xlsx` workbook.

### Sheet: "Scores"

Column layout (9 columns, header row at row 5 after 4-row banner):

| Col | Header           | Source field                           | Width |
|-----|------------------|----------------------------------------|-------|
| A   | S.No             | Sequential row number                  | 14    |
| B   | Category         | `subcategory.category.name`            | 14    |
| C   | Measurable point | `subcategory.name`                     | 28    |
| D   | Status           | `status` enum value                    | 14    |
| E   | Observations     | `observations`                         | 32    |
| F   | REMS             | `rems_number`                          | 14    |
| G   | Given            | `score_given`                          | 14    |
| H   | Max              | `max_score`                            | 14    |
| I   | Remarks          | `remarks`                              | 24    |

Rows are sorted by:
1. `subcategory.category.displayOrder` ASC
2. `subcategory.displayOrder` ASC

Banner rows 1–4: product name (row 1), report title (row 2), metadata (row 3), spacer (row 4).
Column headers appear at row 5. Data from row 6 onward (zebra-striped).

### Other sheets in the same workbook

| Sheet    | Contents                                           |
|----------|----------------------------------------------------|
| Summary  | Key-value visit metadata (branch, date, SFH, etc)  |
| Utility  | Electricity / units consumed / OT by Q1–Q3         |
| Issues   | All visit issues with category, description, status|

---

## 12. API Endpoints

All endpoints require `Authorization: Bearer <jwt>`.

| Method | Path                                    | Role       | Description                                         |
|--------|-----------------------------------------|------------|-----------------------------------------------------|
| GET    | `/categories`                           | any        | List active categories with active subcategories    |
| POST   | `/categories`                           | supervisor | Create new category                                 |
| PATCH  | `/categories/:id`                       | supervisor | Versioned update (new row + deactivate old)         |
| POST   | `/categories/:catId/subcategories`      | supervisor | Add subcategory to category                         |
| PATCH  | `/categories/:catId/subcategories/:sub` | supervisor | Versioned subcategory update                        |
| DELETE | `/categories/:catId/subcategories/:sub` | supervisor | Soft-delete subcategory (`is_active = false`)       |
| GET    | `/visits/:id/scores`                    | any        | Get all score rows for a visit, ordered             |
| PUT    | `/visits/:id/scores`                    | sfh        | Batch-update scores + recalculate snapshot          |
| GET    | `/visits/:id`                           | any        | Full visit detail incl. scores, issues, snapshot    |
| GET    | `/visits/:id/pdf`                       | any        | Download visit PDF (Puppeteer)                      |
| GET    | `/visits/:id/excel`                     | any        | Download visit Excel workbook                       |

### PUT `/visits/:id/scores` — request body

```json
[
  {
    "subcategoryId": "uuid",
    "status": "yes | no | not_applicable",
    "scoreGiven": 4,
    "observations": "string or null",
    "remsNumber": "string or null",
    "remarks": "string or null"
  }
]
```

Server-side validation rules:
- `scoreGiven` is required unless `status = not_applicable`
- `scoreGiven` must satisfy `0 ≤ scoreGiven ≤ max_score`; violation → HTTP 400
- `status = not_applicable` forces `scoreGiven = null`
- Unknown `subcategoryId` (not in this visit's score rows) → HTTP 400
- Array must contain at least 1 element

Response on success:
```json
{ "ok": true, "scoreSnapshot": { ...ScoreSnapshot fields... } }
```

---

## 13. Known Bugs (Audit Findings)

### C-1 — PDF issue badges always show "open" (red)

**File:** [backend/src/services/pdfGeneration.service.ts](backend/src/services/pdfGeneration.service.ts) line 533
```typescript
// Current (broken):
const status = (it.issueStatus ?? "").toLowerCase() === "closed" ? "closed" : "open";

// Fix:
const status = it.issueStatus === "resolved" ? "closed" : "open";
```
**Problem:** `IssueStatus` enum has `open`, `in_progress`, `resolved` — no `"closed"`.
Comparison always false → every badge renders `badge-open` (red), regardless of status.

---

### C-2 — Q4 utility data inaccessible

**File:** `backend/src/routes/utility.ts`
**Problem:** Route validates `quarter_number <= 3`, blocking Q4 data entry.
Cap must be raised to 4.

---

### C-3 — All-N/A visits receive "critical" band

**File:** [backend/src/services/scoreCalculation.service.ts](backend/src/services/scoreCalculation.service.ts) line 50
```typescript
const scorePercentage = maxTotal <= 0 ? 0 : ...
```
**Problem:** All-NA → `maxTotal = 0` → `scorePercentage = 0` → `bandFromPct(0) = "critical"`.
A visit where no subcategory is applicable should show a neutral/special band, not critical.

---

### M-1 — PDF summary sort (alphabetical) ≠ detail sort (displayOrder)

Summary table: sorted by `name.localeCompare()`.
Detail sections: sorted by `category.displayOrder`.
S.No values become inconsistent if display order ≠ alphabetical order.

---

### M-2 — N+1 query in pending branches report

The pending branches report iterates over visits and makes individual DB lookups
per branch rather than a single JOIN query.

---

### M-3 — Unsafe type cast in `loadVisitPdfModel`

Uses `as unknown as VisitPdfModel` which bypasses TypeScript type-checking.
Shape divergence between Prisma result and the declared type is invisible at compile
time and surfaces only as a runtime crash.

---

### M-4 — `rmsVendorName` unreachable from visit form

`Branch.rmsVendorName` is stored and rendered in the PDF, but the SFH visit edit
form has no input for it. Changes can only be made via branch bulk upload.

---

### M-5 — `visitType` has no schema default

`BranchVisit.visitType` is required (`@map("visit_type")`) with no `@default`.
Visit creation will fail if the caller does not supply this field.

---

### M-6 — Dashboard Q4 breakdown silently dropped

Dashboard quarterly breakdown filters `quarter_number <= 3`, causing Q4 data
to be omitted from the breakdown chart when a financial year has a Q4.

---

## 14. Score Band Colour Reference

| Band                | UI token   | CSS colour (approx) |
|---------------------|------------|---------------------|
| `excellent`         | success    | #16a34a (green)     |
| `good`              | processing | #2563eb (blue)      |
| `satisfactory`      | warning    | #d97706 (amber)     |
| `needs_improvement` | warning    | #ea580c (orange)    |
| `critical`          | error      | #dc2626 (red)       |

In the PDF, the `score-card` uses a gradient indigo background with the raw percentage
and band label in accent colour (`#4f46e5`). There is no per-band colour differentiation
in the PDF score card — it uses the same indigo styling for all bands.
