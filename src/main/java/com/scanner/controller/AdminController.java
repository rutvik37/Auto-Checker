package com.scanner.controller;

import com.scanner.model.*;
import com.scanner.repository.*;
import com.scanner.service.SpellingValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDateTime;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(origins = "*")
public class AdminController {

    private final ProjectRepository projectRepository;
    private final ScanRepository scanRepository;
    private final ScannedPageRepository scannedPageRepository;
    private final IssueRepository issueRepository;
    private final ValidationCacheRepository validationCacheRepository;
    private final SpellingValidator spellingValidator;

    @org.springframework.beans.factory.annotation.Value("${admin.security.pin:5555}")
    private String securityPin;

    @Autowired
    public AdminController(ProjectRepository projectRepository,
                           ScanRepository scanRepository,
                           ScannedPageRepository scannedPageRepository,
                           IssueRepository issueRepository,
                           ValidationCacheRepository validationCacheRepository,
                           SpellingValidator spellingValidator) {
        this.projectRepository = projectRepository;
        this.scanRepository = scanRepository;
        this.scannedPageRepository = scannedPageRepository;
        this.issueRepository = issueRepository;
        this.validationCacheRepository = validationCacheRepository;
        this.spellingValidator = spellingValidator;
    }

    // 0. Security Endpoints
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, jakarta.servlet.http.HttpServletRequest request) {
        String pin = body.get("pin");
        if (securityPin.equals(pin)) {
            jakarta.servlet.http.HttpSession session = request.getSession(true);
            session.setAttribute("admin_authenticated", true);
            Map<String, Object> resp = new HashMap<>();
            resp.put("authenticated", true);
            resp.put("message", "Login successful");
            return ResponseEntity.ok(resp);
        } else {
            Map<String, Object> resp = new HashMap<>();
            resp.put("authenticated", false);
            resp.put("message", "Invalid PIN");
            return ResponseEntity.status(401).body(resp);
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(jakarta.servlet.http.HttpServletRequest request) {
        jakarta.servlet.http.HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus(jakarta.servlet.http.HttpServletRequest request) {
        jakarta.servlet.http.HttpSession session = request.getSession(false);
        boolean authenticated = session != null && Boolean.TRUE.equals(session.getAttribute("admin_authenticated"));
        Map<String, Object> resp = new HashMap<>();
        resp.put("authenticated", authenticated);
        return ResponseEntity.ok(resp);
    }

    private Pageable createPageable(int page, int size, String sort) {
        String[] parts = sort.split(",");
        String property = parts[0];
        Sort.Direction direction = parts.length > 1 && parts[1].equalsIgnoreCase("desc")
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return PageRequest.of(page, size, Sort.by(direction, property));
    }

    private String escapeCsv(String val) {
        if (val == null) return "";
        return val.replace("\"", "\"\"");
    }

    // 1. Dashboard Metrics
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard() {
        Map<String, Object> data = new HashMap<>();
        long totalProjects = projectRepository.count();
        long totalScans = scanRepository.count();
        long totalPagesCrawled = scannedPageRepository.count();
        long totalIssues = issueRepository.count();
        long totalCachedWords = validationCacheRepository.count();
        long uniqueCachedWords = validationCacheRepository.countUniqueWords();
        long totalActiveCacheEntries = totalCachedWords;

        String latestScanStatus = "N/A";
        long latestScanDurationSeconds = 0;

        Pageable limitOne = PageRequest.of(0, 1, Sort.by(Sort.Direction.DESC, "id"));
        Page<Scan> latestScanPage = scanRepository.findAll(limitOne);
        if (!latestScanPage.isEmpty()) {
            Scan latest = latestScanPage.getContent().get(0);
            latestScanStatus = latest.getStatus();
            if (latest.getStartedAt() != null && latest.getEndedAt() != null) {
                latestScanDurationSeconds = Duration.between(latest.getStartedAt(), latest.getEndedAt()).toSeconds();
            } else if (latest.getStartedAt() != null) {
                latestScanDurationSeconds = Duration.between(latest.getStartedAt(), LocalDateTime.now()).toSeconds();
            }
        }

        data.put("totalProjects", totalProjects);
        data.put("totalScans", totalScans);
        data.put("totalPagesCrawled", totalPagesCrawled);
        data.put("totalIssues", totalIssues);
        data.put("totalCachedWords", totalCachedWords);
        data.put("uniqueCachedWords", uniqueCachedWords);
        data.put("totalActiveCacheEntries", totalActiveCacheEntries);
        data.put("latestScanStatus", latestScanStatus);
        data.put("latestScanDurationSeconds", latestScanDurationSeconds);
        return ResponseEntity.ok(data);
    }

    // 2. Projects Page
    @GetMapping("/projects")
    public ResponseEntity<Page<Project>> getProjects(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id,desc") String sort,
            @RequestParam(required = false) String search) {
        Pageable pageable = createPageable(page, size, sort);
        return ResponseEntity.ok(projectRepository.searchProjects(search, pageable));
    }

    // 3. Scan History Page
    @GetMapping("/scans")
    public ResponseEntity<Page<Map<String, Object>>> getScans(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id,desc") String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        Pageable pageable = createPageable(page, size, sort);
        Page<Scan> scanPage = scanRepository.searchScans(status, search, pageable);

        List<Map<String, Object>> content = scanPage.getContent().stream().map(scan -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", scan.getId());
            map.put("projectId", scan.getProject().getId());
            map.put("projectName", scan.getProject().getName());
            map.put("name", scan.getName());
            map.put("url", scan.getUrl());
            map.put("status", scan.getStatus());
            map.put("pagesScanned", scan.getPagesScanned());
            map.put("wordsChecked", scan.getWordsChecked());
            map.put("totalIssues", scan.getTotalIssues());
            map.put("startedAt", scan.getStartedAt());
            map.put("endedAt", scan.getEndedAt());

            long durationSeconds = 0;
            if (scan.getStartedAt() != null && scan.getEndedAt() != null) {
                durationSeconds = Duration.between(scan.getStartedAt(), scan.getEndedAt()).toSeconds();
            } else if (scan.getStartedAt() != null) {
                durationSeconds = Duration.between(scan.getStartedAt(), LocalDateTime.now()).toSeconds();
            }
            map.put("durationSeconds", durationSeconds);
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(new PageImpl<>(content, pageable, scanPage.getTotalElements()));
    }

    // 4. Scan Details Page
    @GetMapping("/scans/{id}")
    public ResponseEntity<?> getScanDetails(@PathVariable Long id) {
        return scanRepository.findById(id).map(scan -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", scan.getId());
            map.put("projectId", scan.getProject().getId());
            map.put("projectName", scan.getProject().getName());
            map.put("name", scan.getName());
            map.put("url", scan.getUrl());
            map.put("status", scan.getStatus());
            map.put("maxPages", scan.getMaxPages());
            map.put("crawlDepth", scan.getCrawlDepth());
            map.put("pagesScanned", scan.getPagesScanned());
            map.put("wordsChecked", scan.getWordsChecked());
            map.put("totalIssues", scan.getTotalIssues());
            map.put("startedAt", scan.getStartedAt());
            map.put("endedAt", scan.getEndedAt());

            long durationSeconds = 0;
            if (scan.getStartedAt() != null && scan.getEndedAt() != null) {
                durationSeconds = Duration.between(scan.getStartedAt(), scan.getEndedAt()).toSeconds();
            } else if (scan.getStartedAt() != null) {
                durationSeconds = Duration.between(scan.getStartedAt(), LocalDateTime.now()).toSeconds();
            }
            map.put("durationSeconds", durationSeconds);

            // Issue breakdown by detection source
            List<Object[]> breakdown = issueRepository.getIssueBreakdown(id);
            Map<String, Long> breakdownMap = new HashMap<>();
            for (Object[] row : breakdown) {
                breakdownMap.put((String) row[0], (Long) row[1]);
            }
            map.put("issueBreakdown", breakdownMap);

            return ResponseEntity.ok(map);
        }).orElse(ResponseEntity.notFound().build());
    }

    // 5. Pages Page
    @GetMapping("/pages")
    public ResponseEntity<Page<ScannedPage>> getPages(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id,desc") String sort,
            @RequestParam(required = false) Long scanId,
            @RequestParam(required = false) Integer statusCode,
            @RequestParam(required = false) String search) {
        Pageable pageable = createPageable(page, size, sort);
        return ResponseEntity.ok(scannedPageRepository.searchScannedPages(scanId, statusCode, search, pageable));
    }

    // 6. Issues Page
    @GetMapping("/issues")
    public ResponseEntity<Page<Issue>> getIssues(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id,desc") String sort,
            @RequestParam(required = false) Long scanId,
            @RequestParam(required = false) Boolean removed,
            @RequestParam(required = false) String detectionSource,
            @RequestParam(required = false) String search) {
        Pageable pageable = createPageable(page, size, sort);
        return ResponseEntity.ok(issueRepository.searchIssues(scanId, removed, detectionSource, search, pageable));
    }

    @PostMapping("/issues/{id}/remove")
    public ResponseEntity<?> removeIssue(@PathVariable Long id) {
        return issueRepository.findById(id).map(issue -> {
            issue.setRemoved(true);
            issueRepository.save(issue);
            Scan scan = issue.getScan();
            if (scan != null) {
                long activeCount = issueRepository.countByScanIdAndRemovedFalse(scan.getId());
                scan.setTotalIssues((int) activeCount);
                scanRepository.save(scan);
            }
            return ResponseEntity.ok().build();
        }).orElse(ResponseEntity.notFound().build());
    }

    // 7. Cache Page
    @GetMapping("/cache")
    public ResponseEntity<Page<ValidationCache>> getCache(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "id,desc") String sort,
            @RequestParam(required = false) String decision,
            @RequestParam(required = false) String search) {
        Pageable pageable = createPageable(page, size, sort);
        return ResponseEntity.ok(validationCacheRepository.searchCache(decision, search, pageable));
    }

    @GetMapping("/cache/stats")
    public ResponseEntity<Map<String, Object>> getCacheStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalEntries", validationCacheRepository.count());
        stats.put("validDecisions", validationCacheRepository.countByDecision("VALID"));
        stats.put("typoDecisions", validationCacheRepository.countByDecision("TYPO"));
        return ResponseEntity.ok(stats);
    }

    @DeleteMapping("/cache/{id}")
    public ResponseEntity<?> deleteCacheEntry(@PathVariable Long id) {
        if (validationCacheRepository.existsById(id)) {
            validationCacheRepository.deleteById(id);
            spellingValidator.clearMemoryCache();
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }

    @PostMapping("/cache/clear")
    public ResponseEntity<?> clearCache() {
        validationCacheRepository.deleteAll();
        spellingValidator.clearMemoryCache();
        return ResponseEntity.ok().build();
    }

    // 8. Analytics Page
    @GetMapping("/analytics")
    public ResponseEntity<Map<String, Object>> getAnalytics() {
        Map<String, Object> data = new HashMap<>();

        // Last 15 scans
        Pageable last15 = PageRequest.of(0, 15);
        List<Object[]> scanMetrics = scanRepository.getScanAnalyticsLimit(last15);
        List<Map<String, Object>> scanList = new ArrayList<>();
        for (Object[] row : scanMetrics) {
            Map<String, Object> m = new HashMap<>();
            m.put("name", row[0]);
            m.put("totalIssues", row[1]);
            m.put("pagesScanned", row[2]);
            m.put("wordsChecked", row[3]);
            m.put("id", row[4]);
            scanList.add(m);
        }
        Collections.reverse(scanList);
        data.put("scans", scanList);

        // Cache growth
        List<Object[]> cacheGrowth = validationCacheRepository.getCacheGrowth();
        List<Map<String, Object>> growthList = new ArrayList<>();
        for (Object[] row : cacheGrowth) {
            Map<String, Object> m = new HashMap<>();
            m.put("date", row[0]);
            m.put("count", row[1]);
            growthList.add(m);
        }
        Collections.reverse(growthList);
        data.put("cacheGrowth", growthList);

        // Top repeated misspellings (typos, top 10)
        List<Object[]> topMisspellings = issueRepository.getTopRepeatedMisspellings(PageRequest.of(0, 10));
        List<Map<String, Object>> misspellingList = new ArrayList<>();
        for (Object[] row : topMisspellings) {
            Map<String, Object> m = new HashMap<>();
            m.put("word", row[0]);
            m.put("count", row[1]);
            misspellingList.add(m);
        }
        data.put("topMisspellings", misspellingList);

        // Most frequently flagged (all, top 10)
        List<Object[]> topFlagged = issueRepository.getMostFrequentlyFlagged(PageRequest.of(0, 10));
        List<Map<String, Object>> flaggedList = new ArrayList<>();
        for (Object[] row : topFlagged) {
            Map<String, Object> m = new HashMap<>();
            m.put("word", row[0]);
            m.put("count", row[1]);
            flaggedList.add(m);
        }
        data.put("topFlagged", flaggedList);

        return ResponseEntity.ok(data);
    }

    // 9. Exports
    @GetMapping("/export/scans/csv")
    public void exportScansCsv(HttpServletResponse response) throws IOException {
        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"scans_export.csv\"");
        List<Scan> scans = scanRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        PrintWriter writer = response.getWriter();
        writer.println("Scan ID,Project,Name,URL,Status,Pages Scanned,Words Checked,Total Issues,Started At,Ended At");
        for (Scan s : scans) {
            writer.println(String.format("%d,\"%s\",\"%s\",\"%s\",\"%s\",%d,%d,%d,\"%s\",\"%s\"",
                    s.getId(),
                    escapeCsv(s.getProject().getName()),
                    escapeCsv(s.getName()),
                    escapeCsv(s.getUrl()),
                    s.getStatus(),
                    s.getPagesScanned(),
                    s.getWordsChecked(),
                    s.getTotalIssues(),
                    s.getStartedAt() != null ? s.getStartedAt().toString() : "",
                    s.getEndedAt() != null ? s.getEndedAt().toString() : ""
            ));
        }
        writer.flush();
    }

    @GetMapping("/export/scans/excel")
    public void exportScansExcel(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"scans_export.xlsx\"");
        List<Scan> scans = scanRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        try (Workbook workbook = new XSSFWorkbook();
             java.io.OutputStream out = response.getOutputStream()) {
            Sheet sheet = workbook.createSheet("Scans");
            Row header = sheet.createRow(0);
            String[] cols = {"Scan ID", "Project", "Name", "URL", "Status", "Pages Scanned", "Words Checked", "Total Issues", "Started At", "Ended At"};
            for (int i = 0; i < cols.length; i++) {
                header.createCell(i).setCellValue(cols[i]);
            }
            int rowIdx = 1;
            for (Scan s : scans) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(s.getId());
                row.createCell(1).setCellValue(s.getProject().getName());
                row.createCell(2).setCellValue(s.getName());
                row.createCell(3).setCellValue(s.getUrl());
                row.createCell(4).setCellValue(s.getStatus());
                row.createCell(5).setCellValue(s.getPagesScanned());
                row.createCell(6).setCellValue(s.getWordsChecked());
                row.createCell(7).setCellValue(s.getTotalIssues());
                row.createCell(8).setCellValue(s.getStartedAt() != null ? s.getStartedAt().toString() : "");
                row.createCell(9).setCellValue(s.getEndedAt() != null ? s.getEndedAt().toString() : "");
            }
            workbook.write(out);
            out.flush();
        }
    }

    @GetMapping("/export/scans/json")
    public ResponseEntity<List<Scan>> exportScansJson() {
        return ResponseEntity.ok(scanRepository.findAll(Sort.by(Sort.Direction.DESC, "id")));
    }

    @GetMapping("/export/issues/csv")
    public void exportIssuesCsv(HttpServletResponse response) throws IOException {
        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"issues_export.csv\"");
        List<Issue> issues = issueRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        PrintWriter writer = response.getWriter();
        writer.println("Issue ID,Scan ID,Word,Suggested Text,Page URL,Page Title,DOM Element,HTML Tag,Detection Source,Timestamp,Removed");
        for (Issue i : issues) {
            writer.println(String.format("%d,%d,\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",%b",
                    i.getId(),
                    i.getScan() != null ? i.getScan().getId() : 0,
                    escapeCsv(i.getWord()),
                    escapeCsv(i.getSuggestedText()),
                    escapeCsv(i.getPageUrl()),
                    escapeCsv(i.getPageTitle()),
                    escapeCsv(i.getDomElement()),
                    escapeCsv(i.getHtmlTag()),
                    escapeCsv(i.getDetectionSource()),
                    i.getTimestamp() != null ? i.getTimestamp().toString() : "",
                    i.isRemoved()
            ));
        }
        writer.flush();
    }

    @GetMapping("/export/issues/excel")
    public void exportIssuesExcel(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"issues_export.xlsx\"");
        List<Issue> issues = issueRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        try (Workbook workbook = new XSSFWorkbook();
             java.io.OutputStream out = response.getOutputStream()) {
            Sheet sheet = workbook.createSheet("Issues");
            Row header = sheet.createRow(0);
            String[] cols = {"Issue ID", "Scan ID", "Word", "Suggested Text", "Page URL", "Page Title", "DOM Element", "HTML Tag", "Detection Source", "Timestamp", "Removed"};
            for (int i = 0; i < cols.length; i++) {
                header.createCell(i).setCellValue(cols[i]);
            }
            int rowIdx = 1;
            for (Issue i : issues) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(i.getId());
                row.createCell(1).setCellValue(i.getScan() != null ? i.getScan().getId() : 0);
                row.createCell(2).setCellValue(i.getWord());
                row.createCell(3).setCellValue(i.getSuggestedText());
                row.createCell(4).setCellValue(i.getPageUrl());
                row.createCell(5).setCellValue(i.getPageTitle());
                row.createCell(6).setCellValue(i.getDomElement());
                row.createCell(7).setCellValue(i.getHtmlTag());
                row.createCell(8).setCellValue(i.getDetectionSource());
                row.createCell(9).setCellValue(i.getTimestamp() != null ? i.getTimestamp().toString() : "");
                row.createCell(10).setCellValue(i.isRemoved() ? "Yes" : "No");
            }
            workbook.write(out);
            out.flush();
        }
    }

    @GetMapping("/export/issues/json")
    public ResponseEntity<List<Issue>> exportIssuesJson() {
        return ResponseEntity.ok(issueRepository.findAll(Sort.by(Sort.Direction.DESC, "id")));
    }

    @GetMapping("/export/cache/csv")
    public void exportCacheCsv(HttpServletResponse response) throws IOException {
        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"cache_export.csv\"");
        List<ValidationCache> cache = validationCacheRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        PrintWriter writer = response.getWriter();
        writer.println("ID,Word,Suggestion,Decision,Reason,Created At");
        for (ValidationCache c : cache) {
            writer.println(String.format("%d,\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"",
                    c.getId(),
                    escapeCsv(c.getWord()),
                    escapeCsv(c.getSuggestion()),
                    c.getDecision(),
                    escapeCsv(c.getReason()),
                    c.getCreatedAt() != null ? c.getCreatedAt().toString() : ""
            ));
        }
        writer.flush();
    }

    @GetMapping("/export/cache/excel")
    public void exportCacheExcel(HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"cache_export.xlsx\"");
        List<ValidationCache> cache = validationCacheRepository.findAll(Sort.by(Sort.Direction.DESC, "id"));
        try (Workbook workbook = new XSSFWorkbook();
             java.io.OutputStream out = response.getOutputStream()) {
            Sheet sheet = workbook.createSheet("Cache Entries");
            Row header = sheet.createRow(0);
            String[] cols = {"ID", "Word", "Suggestion", "Decision", "Reason", "Created At"};
            for (int i = 0; i < cols.length; i++) {
                header.createCell(i).setCellValue(cols[i]);
            }
            int rowIdx = 1;
            for (ValidationCache c : cache) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(c.getId());
                row.createCell(1).setCellValue(c.getWord());
                row.createCell(2).setCellValue(c.getSuggestion());
                row.createCell(3).setCellValue(c.getDecision());
                row.createCell(4).setCellValue(c.getReason());
                row.createCell(5).setCellValue(c.getCreatedAt() != null ? c.getCreatedAt().toString() : "");
            }
            workbook.write(out);
            out.flush();
        }
    }

    @GetMapping("/export/cache/json")
    public ResponseEntity<List<ValidationCache>> exportCacheJson() {
        return ResponseEntity.ok(validationCacheRepository.findAll(Sort.by(Sort.Direction.DESC, "id")));
    }
}
