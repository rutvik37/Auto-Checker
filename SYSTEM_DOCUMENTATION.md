# Auto-Checker | Comprehensive System Documentation & Architecture Guide

Welcome to the official, full system documentation for **Auto-Checker: Automated Website Spelling Engine**. This document provides an exhaustive breakdown of all system functionalities, frontend features, backend architecture, crawler logic, AI validation pipeline, database schema, and deduplication mechanisms for both the **Main Website** and the **Admin Control Panel**.

---

## 🛠️ 1. Technical Stack & System Overview

- **Core Framework**: Java 21 (JDK 21.0.11) with Spring Boot 3.2.5
- **Build & Management**: Bundled Apache Maven 3.9.6 (configured with `./run-mac.sh`)
- **Database**: SQLite 3 (`scanner.db`) via Hibernate ORM + custom JDBC startup schema migration runner (`DatabaseMigrationService`)
- **Server Port**: `9090` (`server.port=9090`)
- **Frontend Architecture**: Vanilla HTML5, Vanilla CSS3 (Glassmorphism design system), JavaScript (ES6+), FontAwesome 6.5, Server-Sent Events (SSE)
- **NLP & Spellchecking Engine**:
  - Primary Engine: LanguageTool (American English)
  - Secondary AI Validation: Groq LLM API integration (`groq/compound`)
  - Cache Engine: SQLite persistent `validation_cache` with in-memory ConcurrentHashMap

---

## 🌐 2. Main Website Functionalities & Logic

The Main Website (`/` -> `index.html`) is the primary public interface used by QA engineers, developers, and website owners to run automated spelling audits.

### 2.1. Website Spell Check Form
Located at the top of the main dashboard, this glassmorphism card allows users to configure and initiate audits.

- **Project Name (`#scan-project-name`)**: Mandatory field specifying the project or website group.
- **Website URL to Scan (`#scan-url`)**: Target website seed URL (e.g., `https://example.com` or `http://localhost:9090/spelling-test.html`).
- **Max Pages (`#max-pages`)**: Numeric input specifying the maximum number of unique internal URLs the crawler will discover and inspect (e.g., 50 to 500).
- **Crawl Depth (`#crawl-depth`)**: Numeric input defining the maximum link hop depth from the seed URL (Depth 1 = seed page only, Depth 3 = up to 3 link hops).
- **Scan Entire Website (Include All Pages & Unlimited Depth) Checkbox (`#scan-all-pages`)**:
  - **Dynamic UI Behavior**: Toggled via `toggleScanAllPagesMode(isChecked)` in `app.js`. Checking this box immediately disables the `Max Pages` and `Crawl Depth` fields, setting their placeholders to `"Unlimited (Full Website Scan)"` and dimming their opacity.
  - **Backend Logic**: When enabled, sends `maxPages: 0` and `crawlDepth: 0` in the payload. The backend crawler interprets `0` or `<= 0` as unlimited mode, continuously discovering and auditing all internal pages across the entire website domain until no unvisited internal links remain.
- **Action Buttons**:
  - `Start Spelling Check` (`#btn-start-scan`): Validates inputs, creates or loads the project via `/api/projects`, triggers the scan via `/api/projects/{id}/scans`, and establishes a real-time SSE stream.
  - `Reset` (`#btn-reset-scan`): Resets the form, unchecks the full scan checkbox, re-enables inputs, closes active SSE connections, and clears the UI results.

### 2.2. Real-Time Progress Statistics Card
Appears automatically once a scan is initialized.

- **Pulse Icon & Status Badge**: Visual indicator showing active scan state (`Scanning Progress` with animated spinner).
- **Stop Scan Button (`#btn-cancel-scan`)**: Sends a cancellation signal via `/api/scans/{id}/cancel` to immediately halt crawler workers.
- **Real-Time Metric Counters**:
  - `Pages Crawled` (`#stat-pages`): Count of successfully fetched and parsed web pages.
  - `Spelling Issues Found` (`#stat-spelling`): Count of validated unique spelling mistakes.
  - `Words Checked` (`#stat-words`): Total word count processed across all pages.
- **Dual Progress Bar**:
  - Displays animated progress percentage (`#progress-percentage` and `#progress-bar-fill`).
  - Calculates dynamic completion estimates based on queued vs. processed URLs.

### 2.3. Spelling Mistakes Log Table
Renders real-time detected spelling issues as they are streamed from the server.

- **Columns**:
  - `Spelling Mistake Word`: Highlighted status badge showing the exact flagged misspelled word.
  - `Expected Correct Word`: Suggestions provided by LanguageTool/Groq AI.
  - `Page URL`: Clickable link opening the target page in a new browser tab.
  - `Page Title`: Page `<title>` tag content.
  - `Sentence`: Contextual sentence containing the typo, with the misspelled word bolded/highlighted.
  - `Action`: Ignore button allowing users to hide specific issues (`/api/issues/{id}/remove`).
- **Export Controls**:
  - `Export CSV`: Downloads complete scan results as a formatted `.csv` file.
  - `Export Excel`: Downloads complete scan results as a formatted `.xlsx` spreadsheet.
- **Zero-Defects Celebration Mode**:
  - Triggers a celebratory UI card ("Zero Spelling Issues Found! 🏆") when a website scan completes with 0 typos detected.

### 2.4. Brain Break Quiz Challenge Widget
An interactive trivia mini-game embedded on the main website to keep users entertained while long crawler audits execute in the background.

- Configurable via Admin Panel (toggle widget on/off or set question intervals).
- Features Technology Trivia and World Wonders questions with score tracking and instant feedback.

### 2.5. Universal Footer & Navigation
- **Navigation Links**: Direct links to Home (`/`), Documentation (`/documentation`), Help Center (`/help`), and Admin Panel (`/admin`).
- **Official Brand Branding**: Uses the official purple magic wand & sparkles icon, Title (`Auto-Checker`), Tagline (`Automated Website Spelling Engine`), and dynamic copyright notices pulled from `settings.json`.

---

## 🔒 3. Admin Control Panel Functionalities & Logic

The Admin Panel (`/admin` -> `admin.html`) provides system administrators and QA leads with central management tools for all projects, scans, dictionaries, cache statistics, and branding settings.

### 3.1. Access & Brand Navigation
- **Login Page Brand Card**: Features the official clickable brand header banner (Magic Wand Favicon, Title, Tagline) that redirects directly to the main website (`/`).
- **Sidebar & Top Bar Header**: Includes an interactive **"View Website"** link button enabling administrators to quickly toggle between the admin dashboard and public scanner.

### 3.2. QA Spelling Issues Log (`/api/admin/issues`)
Centralized repository of all detected spelling issues across all projects, pages, and scans.

#### 🌟 1 Unique Entry Per Misspelled Word (Global Deduplication Logic)
- **Single-Row Policy**: Unlike traditional scanners that output duplicate rows every time a word is encountered across different pages or scans, Auto-Checker enforces **1 unique entry per misspelled word**.
- **Multi-Page Merging**: If the word `DEVELOPPED` is found across 3 different pages or multiple scan runs:
  - The Admin Panel displays **1 row** for `DEVELOPPED`.
  - **Page URL Column**: Renders the primary page URL link alongside an interactive badge: `+X pages` (e.g., `+2 pages`). Hovering over the badge displays a tooltip listing all page URLs where the word was detected.
  - **Timestamp**: Automatically updates to the latest date and time found.
  - **Sentence**: Stores the latest representative sentence context.
- **Filtering & Search**:
  - Search bar: Real-time search across words, URLs, and page titles.
  - Source filter: Filter by detection source (`All Detection Sources`, `LanguageTool`, `Groq AI`).
  - Status filter: Toggle between `Active Issues Only` and `Removed / Ignored Issues`.

### 3.3. Executive Dashboard & Performance Analytics
- **System KPIs**: Displays Total Projects, Total Scans Executed, Total Unique Issues, Total Validated Words, and Cache Hit Ratio.
- **Performance Tracker Monitor**: Real-time breakdown of pipeline latencies:
  - Total Crawl Loop Time (ms)
  - Jsoup Page Download Time (ms)
  - HTML Parsing Time (ms)
  - Database Save Time (ms)
  - LanguageTool & Groq AI Validation Latency (ms)

### 3.4. Projects & Scan History Management
- **Projects Explorer**: View project lists, total scans per project, and total defects per project.
- **Scan History Log**: Comprehensive table of all historical scans with status indicators (`COMPLETED`, `SCANNING`, `CANCELLED`), Duration (seconds), Pages Scanned, Words Checked, and Total Issues.
- **Detailed Scan Inspector**: Clicking any scan opens the Scan Inspector modal showing:
  - Scan metrics and configuration parameters.
  - Scanned Pages list with HTTP status codes (200, 404, 500).
  - Issue breakdown chart by detection source.

### 3.5. Validation Cache Management (`/api/admin/cache`)
Monitors and manages the SQLite persistent `validation_cache` table.

- **Cache Statistics**: Total Cache Entries, Valid Words Count, Typo Words Count.
- **Cache Data Table**: Search and view cached words, decisions (`VALID` vs. `TYPO`), reasons, and timestamps.
- **Clear Cache Control**: Allows clearing cache entries to force fresh re-validation.

### 3.6. Custom Dictionaries Control
Provides direct editor controls for custom spelling rule files stored in `CustomDictionaries/`:

- **Global Whitelist (`global.txt`)**: System-wide allowed words (e.g., brand names, industry jargon). Words listed here are never flagged as typos.
- **User Whitelist (`user.txt`)**: User-added custom allowed words.
- **Blacklist (`blacklist.txt`)**: Explicitly forbidden words that are always flagged as typos.

### 3.7. Footer & Brand Management (`/api/admin/footer-settings`)
Allows administrators to customize website branding without modifying code.

- **Brand Controls**:
  - `App Name / Title`: e.g., `Auto-Checker`
  - `Tagline`: e.g., `Automated Website Spelling Engine`
  - `Logo Icon Class`: FontAwesome icon class (e.g., `fa-solid fa-wand-magic-sparkles`).
  - `Custom Logo Image URL / Path`: Image URL or local file path for custom image logos.
  - `Copyright Company Name`: e.g., `Auto-Checker`.
- **Live Preview Card**: Renders a live visual preview of the footer inside the Admin Panel before saving changes.

---

## ⚡ 4. Crawler Engine & AI Validation Pipeline Architecture

The core scanner engine ([CrawlScanService.java](file:///Users/rlogical-dev-60/Auto-Checker/Auto-Checker/src/main/java/com/scanner/service/CrawlScanService.java)) is designed for high throughput, thread safety, and low false-positive rates.

```
[Target Seed URL] 
       │
       ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Multi-Worker Parallel Crawler (ConcurrentLinkedQueue)  │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Jsoup HTML Parsing & Visible Text Extraction            │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Space/Linebreak Word Normalization & Pre-Filtering      │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Custom Dictionaries Check (global.txt / user.txt)        │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  LanguageTool Spellchecking Engine (Local Candidate Gen) │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  SQLite Persistent Validation Cache Check               │
 └────────────────────────────┬─────────────────────────────┘
                              │
                     (Cache Miss / Ambiguous)
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Groq AI LLM Batch Validation Endpoint (groq/compound)   │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Global Word Issue Deduplication & SQLite Database Save  │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Real-Time SSE Web UI Streaming & Export Reports         │
 └────────────────────────────┬─────────────────────────────┘
```

### 4.1. Multi-Worker Parallel Crawler
- Uses a worker thread pool (up to 5 concurrent workers) managed via `ExecutorService`, `ConcurrentLinkedQueue`, `ConcurrentHashMap`, and `AtomicInteger`.
- **Robots.txt & Domain Boundaries**: Checks `robots.txt` disallowed paths and restricts crawling to internal links belonging to the seed domain.
- **Link Discovery**: Extracts `a[href]` tags, strips URL fragment hashes (`#`), normalizes trailing slashes, and enqueues newly discovered URLs.
- **Limit Enforcement**:
  - `crawlDepth`: Checked via `task.depth < scan.getCrawlDepth()` (bypassed when `<= 0`).
  - `maxPages`: Checked via `pagesScannedCount.get() >= scan.getMaxPages()` (bypassed when `<= 0`).

### 4.2. 8-Stage Detection & Validation Pipeline
1. **Jsoup Visible Text Extraction**: Strips non-visible tags (`<script>`, `<style>`, `<noscript>`, `<svg>`, `<iframe>`) and extracts clean text blocks.
2. **Space & Hyphen Normalizer**: Merges words broken across lines or hyphens (e.g. `develo- pment` -> `development`).
3. **Candidate Filtering**: Filters out URLs, email addresses, numbers, alphanumeric codes, currency symbols, and single-letter words.
4. **Dictionary Lookup**: Suppresses words found in `global.txt` or `user.txt`.
5. **LanguageTool Analysis**: Runs local spellcheck to generate preliminary typo candidates and suggested corrections.
6. **SQLite Validation Cache Lookup**: Queries `validation_cache` for pre-verified decisions (`VALID` vs. `TYPO`), instantly resolving cached words without network calls.
7. **Groq AI LLM Batch Validation**: Asynchronously sends unresolved candidate words in batch to Groq AI (`groq/compound`) for contextual verification.
8. **Global Deduplicated Issue Persistence**:
   - Executes global lookup against `issues` table using `LOWER(word)`.
   - If an entry exists: updates `pageUrl` (merging new URLs into a unique comma-separated list), `pageTitle`, `fullSentence`, `suggestedText`, and updates `timestamp` to `LocalDateTime.now()`.
   - If no entry exists: creates a new `Issue` record.

---

## 🗄️ 5. Database Schema & Startup Migrations

The SQLite database (`scanner.db`) is automatically initialized and migrated on application startup.

### 5.1. Database Tables

#### Table: `projects`
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `name` (TEXT, NOT NULL)
- `created_at` (TIMESTAMP)

#### Table: `scans`
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `project_id` (INTEGER, FOREIGN KEY -> `projects.id`)
- `name` (TEXT)
- `url` (TEXT, NOT NULL)
- `status` (TEXT: `SCANNING`, `COMPLETED`, `CANCELLED`)
- `max_pages` (INTEGER)
- `crawl_depth` (INTEGER)
- `pages_scanned` (INTEGER)
- `words_checked` (INTEGER)
- `total_issues` (INTEGER)
- `started_at` (TIMESTAMP)
- `ended_at` (TIMESTAMP)

#### Table: `issues`
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `scan_id` (INTEGER, FOREIGN KEY -> `scans.id`)
- `word` (TEXT, NOT NULL)
- `suggested_text` (TEXT)
- `page_url` (TEXT, NOT NULL) — *Contains single URL or comma-separated list of merged URLs*
- `page_title` (TEXT)
- `dom_element` (TEXT)
- `full_sentence` (TEXT, NOT NULL)
- `text_snippet` (TEXT)
- `html_tag` (TEXT)
- `detection_source` (TEXT)
- `timestamp` (TIMESTAMP)
- `removed` (INTEGER / BOOLEAN, NOT NULL DEFAULT 0)

#### Table: `scanned_pages`
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `scan_id` (INTEGER, FOREIGN KEY -> `scans.id`)
- `page_url` (TEXT, NOT NULL)
- `page_title` (TEXT)
- `status_code` (INTEGER)
- `word_count` (INTEGER)
- `issue_count` (INTEGER)
- `timestamp` (TIMESTAMP)

#### Table: `validation_cache`
- `id` (INTEGER, PRIMARY KEY, AUTOINCREMENT)
- `word` (TEXT, UNIQUE, NOT NULL)
- `decision` (TEXT: `VALID`, `TYPO`)
- `suggested_text` (TEXT)
- `reason` (TEXT)
- `timestamp` (TIMESTAMP)

### 5.2. Startup Schema & Data Migration (`DatabaseMigrationService.java`)
Spring Boot `ApplicationRunner` executing automatically on every server boot:
- **Schema Migration**: Checks `PRAGMA table_info(issues)` and adds `removed` column if missing.
- **Historical Data Consolidation (`consolidateDuplicateWordIssues()`)**:
  - Executes SQL query `SELECT LOWER(word) FROM issues GROUP BY LOWER(word) HAVING COUNT(*) > 1`.
  - For every group of duplicate rows: retains 1 primary record (latest timestamp), combines all unique `page_url` strings into a clean comma-separated list, updates the timestamp, and deletes legacy duplicate rows.

---

## 🧪 6. QA Testing & Validation Page (`spelling-test.html`)

For testing and accuracy validation, the application includes a dedicated QA test page available at:
`http://localhost:9090/spelling-test.html`

### 6.1. Ground Truth Test Suite
Contains controlled intentional spelling mistakes and valid technical terms:
- **Intentional Typos**: `applicaton`, `sentense`, `performence`, `manange`, `succesfully`, `authenticaton`, `recive`, `developped`, `automatd`, `accurrate`, `issuses`, `permisions`, `shoee`, `medicinn`, `chargingg`.
- **Valid Technical Terms (Should NOT flag)**: `JavaScript`, `TypeScript`, `Playwright`, `Selenium`, `GitHub`, `PostgreSQL`, `SQLite`, `localhost`, `API`, `JSON`, `OAuth`, `WebSocket`.

---

## 🚦 7. How to Run & Verify

1. **Start Application**:
   ```bash
   ./run-mac.sh
   ```
2. **Access Interfaces**:
   - Public Website: `http://localhost:9090/`
   - Admin Panel: `http://localhost:9090/admin`
   - QA Test Page: `http://localhost:9090/spelling-test.html`
3. **Verify Full Scan & Single Word Deduplication**:
   - Check the **"Scan Entire Website"** box on the main form and run a scan.
   - Open `/admin` -> **Spelling Issues** to confirm exactly 1 unique row per misspelled word with merged page URLs.

---
*Documentation compiled and updated for Auto-Checker v1.0.*
