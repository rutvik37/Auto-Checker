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

import com.scanner.service.ProjectService;
import com.scanner.service.SettingsService;
import com.scanner.service.LiveLogService;
import com.scanner.service.CrawlScanService;
import com.scanner.service.GroqMetricsService;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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
    private final ProjectService projectService;
    private final SettingsService settingsService;
    private final LiveLogService liveLogService;
    private final CrawlScanService crawlScanService;
    private final GroqMetricsService groqMetricsService;
    private final ProfileImageRepository profileImageRepository;

    @org.springframework.beans.factory.annotation.Value("${ADMIN_PIN:${admin.security.pin:5555}}")
    private String securityPin;

    @Autowired
    public AdminController(ProjectRepository projectRepository,
                           ScanRepository scanRepository,
                           ScannedPageRepository scannedPageRepository,
                           IssueRepository issueRepository,
                           ValidationCacheRepository validationCacheRepository,
                           SpellingValidator spellingValidator,
                           ProjectService projectService,
                           SettingsService settingsService,
                           LiveLogService liveLogService,
                           CrawlScanService crawlScanService,
                           GroqMetricsService groqMetricsService,
                           ProfileImageRepository profileImageRepository) {
        this.projectRepository = projectRepository;
        this.scanRepository = scanRepository;
        this.scannedPageRepository = scannedPageRepository;
        this.issueRepository = issueRepository;
        this.validationCacheRepository = validationCacheRepository;
        this.spellingValidator = spellingValidator;
        this.projectService = projectService;
        this.settingsService = settingsService;
        this.liveLogService = liveLogService;
        this.crawlScanService = crawlScanService;
        this.groqMetricsService = groqMetricsService;
        this.profileImageRepository = profileImageRepository;
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

    @GetMapping("/profile/image")
    public void getProfileImage(HttpServletResponse response) throws IOException {
        try {
            List<ProfileImage> images = profileImageRepository.findAll();
            if (!images.isEmpty()) {
                ProfileImage profileImage = images.get(0);
                response.setContentType(profileImage.getContentType());
                response.getOutputStream().write(profileImage.getData());
                return;
            }
        } catch (Exception dbEx) {
            // Log database lookup error, fall back to file
        }

        // Fallback to local file to seed database
        java.io.File file = new java.io.File("profile-image.png");
        if (file.exists()) {
            try {
                byte[] fileBytes = java.nio.file.Files.readAllBytes(file.toPath());
                ProfileImage dbImage = new ProfileImage("image/png", fileBytes);
                profileImageRepository.save(dbImage);
                response.setContentType("image/png");
                response.getOutputStream().write(fileBytes);
                return;
            } catch (Exception ioEx) {
                // Ignore and return 404
            }
        }
        response.sendError(HttpServletResponse.SC_NOT_FOUND);
    }

    @PostMapping("/profile/image")
    public ResponseEntity<?> uploadProfileImage(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest().body("File is empty");
        }
        try {
            byte[] bytes = file.getBytes();
            String contentType = file.getContentType();
            if (contentType == null || contentType.isEmpty()) {
                contentType = "image/png";
            }
            List<ProfileImage> images = profileImageRepository.findAll();
            ProfileImage profileImage;
            if (!images.isEmpty()) {
                profileImage = images.get(0);
                profileImage.setContentType(contentType);
                profileImage.setData(bytes);
            } else {
                profileImage = new ProfileImage(contentType, bytes);
            }
            profileImageRepository.save(profileImage);

            // Backup copy locally, ignoring filesystem write failures
            try {
                java.io.File dest = new java.io.File("profile-image.png");
                file.transferTo(dest.getAbsoluteFile());
            } catch (Exception fileEx) {
                // Ignore backup save error (e.g. read-only container filesystem)
            }

            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
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
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        Pageable pageable = createPageable(page, size, sort);
        
        java.time.LocalDateTime from = null;
        java.time.LocalDateTime to = null;
        
        if (fromDate != null && !fromDate.trim().isEmpty()) {
            try {
                if (fromDate.length() == 10) {
                    from = java.time.LocalDate.parse(fromDate).atStartOfDay();
                } else {
                    from = java.time.LocalDateTime.parse(fromDate);
                }
            } catch (Exception e) {
                // Ignore parse errors
            }
        }
        if (toDate != null && !toDate.trim().isEmpty()) {
            try {
                if (toDate.length() == 10) {
                    to = java.time.LocalDate.parse(toDate).atTime(23, 59, 59, 999999999);
                } else {
                    to = java.time.LocalDateTime.parse(toDate);
                }
            } catch (Exception e) {
                // Ignore parse errors
            }
        }
        
        return ResponseEntity.ok(projectRepository.searchProjects(search, from, to, pageable));
    }

    @DeleteMapping("/projects/{id}")
    public ResponseEntity<?> deleteProject(@PathVariable Long id) {
        if (projectRepository.existsById(id)) {
            projectService.deleteProject(id);
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
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

    // 10. Settings Management
    @GetMapping("/settings")
    public ResponseEntity<?> getSettings() {
        Map<String, Object> settings = new HashMap<>();
        String key = settingsService.getGroqApiKey();
        String maskedKey = "";
        if (key != null && !key.trim().isEmpty()) {
            key = key.trim();
            if (key.length() > 4) {
                maskedKey = "••••••••••••••••" + key.substring(key.length() - 4);
            } else {
                maskedKey = "••••••••••••••••";
            }
        }
        settings.put("groqApiKey", maskedKey);
        settings.put("groqModel", settingsService.getGroqModel());
        settings.put("groqBatchSize", settingsService.getGroqBatchSize());
        settings.put("crawlerParallelEnabled", settingsService.isCrawlerParallelEnabled());
        settings.put("crawlerParallelWorkers", settingsService.getCrawlerParallelWorkers());
        settings.put("widgetSettings", settingsService.getWidgetSettings());
        settings.put("footerSettings", settingsService.getFooterSettings());
        return ResponseEntity.ok(settings);
    }

    @GetMapping("/public/widget-settings")
    public ResponseEntity<?> getPublicWidgetSettings() {
        return ResponseEntity.ok(settingsService.getWidgetSettings());
    }

    @GetMapping("/widget-settings")
    public ResponseEntity<?> getWidgetSettings() {
        return ResponseEntity.ok(settingsService.getWidgetSettings());
    }

    @PostMapping("/widget-settings")
    public ResponseEntity<?> updateWidgetSettings(@RequestBody Map<String, Object> body) {
        Map<String, Object> map = new HashMap<>();
        map.put("widgetSettings", body);
        settingsService.updateSettings(map);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/widget-settings/reset-counters")
    public ResponseEntity<?> resetWidgetApiCounters() {
        settingsService.resetApiCallCounts();
        return ResponseEntity.ok(settingsService.getWidgetSettings());
    }

    @GetMapping("/footer-settings")
    public ResponseEntity<?> getFooterSettings() {
        return ResponseEntity.ok(settingsService.getFooterSettings());
    }

    @PostMapping("/footer-settings")
    public ResponseEntity<?> updateFooterSettings(@RequestBody Map<String, Object> body) {
        Map<String, Object> map = new HashMap<>();
        map.put("footerSettings", body);
        settingsService.updateSettings(map);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/settings")
    public ResponseEntity<?> updateSettings(@RequestBody Map<String, Object> body) {
        String newKey = (String) body.get("groqApiKey");
        if (newKey != null && !newKey.isEmpty() && !newKey.equals("••••••••••••••••") && !newKey.startsWith("••••••••••••••••")) {
            String specialKey = (String) body.get("specialKey");
            if (specialKey == null || !securityPin.equals(specialKey.trim())) {
                return ResponseEntity.status(403).body("Unauthorized: Invalid Security PIN (Special Key)");
            }
        }
        settingsService.updateSettings(body);
        return ResponseEntity.ok().build();
    }

    // 10.5. Groq Metrics Dashboard
    @GetMapping("/metrics/groq")
    public ResponseEntity<?> getGroqMetrics() {
        String currentModel = settingsService.getGroqModel();
        return ResponseEntity.ok(groqMetricsService.getMetricsReport(currentModel));
    }

    @PostMapping("/metrics/groq/reset")
    public ResponseEntity<?> resetGroqMetrics(@RequestBody Map<String, String> body) {
        String pin = body != null ? body.get("specialKey") : null;
        if (pin == null || !securityPin.equals(pin.trim())) {
            return ResponseEntity.status(403).body("Unauthorized: Invalid Security PIN (Special Key)");
        }
        groqMetricsService.resetMetrics();
        return ResponseEntity.ok().build();
    }

    @PostMapping("/verify-pin")
    public ResponseEntity<?> verifyPin(@RequestBody Map<String, String> body) {
        String pin = body != null ? body.get("pin") : null;
        if (pin != null && securityPin.equals(pin.trim())) {
            return ResponseEntity.ok(Map.of("valid", true));
        } else {
            return ResponseEntity.status(org.springframework.http.HttpStatus.UNAUTHORIZED)
                    .body(Map.of("valid", false, "message", "Invalid Security PIN"));
        }
    }

    // 11. Dictionary Management
    @GetMapping("/dictionaries")
    public ResponseEntity<?> getDictionaries() {
        Map<String, Object> dicts = new HashMap<>();
        dicts.put("global", spellingValidator.getDictionaryWords("global"));
        dicts.put("user", spellingValidator.getDictionaryWords("user"));
        return ResponseEntity.ok(dicts);
    }

    @PostMapping("/dictionaries/add")
    public ResponseEntity<?> addDictionaryWord(@RequestBody Map<String, String> body) {
        String dict = body.get("dictionary");
        String word = body.get("word");
        if (dict == null || word == null) {
            return ResponseEntity.badRequest().body("dictionary and word parameters are required");
        }
        try {
            spellingValidator.addWordToDictionary(dict, word);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @PostMapping("/dictionaries/remove")
    public ResponseEntity<?> removeDictionaryWord(@RequestBody Map<String, String> body) {
        String dict = body.get("dictionary");
        String word = body.get("word");
        if (dict == null || word == null) {
            return ResponseEntity.badRequest().body("dictionary and word parameters are required");
        }
        try {
            spellingValidator.removeWordFromDictionary(dict, word);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    // 12. Active Scan Controls (Port 5555 routing bypass)
    @GetMapping(value = "/scans/{scanId}/stream", produces = "text/event-stream")
    public SseEmitter streamScanProgressAdmin(@PathVariable Long scanId) {
        return liveLogService.register(scanId);
    }

    @PostMapping("/scans/{scanId}/cancel")
    public ResponseEntity<?> cancelScanAdmin(@PathVariable Long scanId) {
        crawlScanService.cancelScan(scanId);
        return ResponseEntity.ok().build();
    }
}
