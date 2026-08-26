package com.scanner.controller;

import com.scanner.model.Project;
import com.scanner.model.Scan;
import com.scanner.model.Issue;
import com.scanner.repository.IssueRepository;
import com.scanner.service.CrawlScanService;
import com.scanner.service.LiveLogService;
import com.scanner.service.ProjectService;
import com.scanner.service.SpellingValidator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import jakarta.servlet.http.HttpServletResponse;

import java.io.PrintWriter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Arrays;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import com.scanner.service.SettingsService;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ProjectController {

    private final ProjectService projectService;
    private final CrawlScanService crawlScanService;
    private final LiveLogService liveLogService;
    private final IssueRepository issueRepository;
    private final SpellingValidator spellingValidator;
    private final SettingsService settingsService;

    @Autowired
    public ProjectController(ProjectService projectService,
            CrawlScanService crawlScanService,
            LiveLogService liveLogService,
            IssueRepository issueRepository,
            SpellingValidator spellingValidator,
            SettingsService settingsService) {
        this.projectService = projectService;
        this.crawlScanService = crawlScanService;
        this.liveLogService = liveLogService;
        this.issueRepository = issueRepository;
        this.spellingValidator = spellingValidator;
        this.settingsService = settingsService;
    }

    @GetMapping("/public/widget-settings")
    public ResponseEntity<?> getPublicWidgetSettings() {
        return ResponseEntity.ok(settingsService.getWidgetSettings());
    }

    @GetMapping("/public/footer-settings")
    public ResponseEntity<?> getPublicFooterSettings() {
        return ResponseEntity.ok(settingsService.getFooterSettings());
    }

    private static final List<Map<String, String>> TECH_FACTS_POOL = List.of(
            Map.of("category", "💡 Tech Secrets", "icon", "fa-solid fa-lightbulb", "fact",
                    "The first computer bug was an actual real moth trapped inside a Harvard Mark II relay in 1947 by Grace Hopper's team!"),
            Map.of("category", "🌐 Web History", "icon", "fa-solid fa-globe", "fact",
                    "The very first website ever created (info.cern.ch) went live on August 6, 1991 by Tim Berners-Lee!"),
            Map.of("category", "🔑 Security Secrets", "icon", "fa-solid fa-key", "fact",
                    "For 20 years (1962 to 1977), the launch code for US nuclear missiles was set to '00000000' for maximum speed!"),
            Map.of("category", "🇮🇳 Indian Supercomputers", "icon", "fa-solid fa-microchip", "fact",
                    "PARAM 8000, built by C-DAC in 1991 under Dr. Vijay Bhatkar, made India a global supercomputing power!"),
            Map.of("category", "🤖 AI Milestones", "icon", "fa-solid fa-brain", "fact",
                    "In 1997, IBM's Deep Blue defeated World Chess Champion Garry Kasparov in a 6-game match!"),
            Map.of("category", "📱 Mobile History", "icon", "fa-solid fa-mobile-screen", "fact",
                    "The first mobile phone call was made in 1973 by Martin Cooper using a 2-pound Motorola DynaTAC!"),
            Map.of("category", "💾 Hardware Tech", "icon", "fa-solid fa-hard-drive", "fact",
                    "In 1956, IBM shipped the RAMAC 305 with 5MB of storage—the hard drive weighed over 1 ton!"),
            Map.of("category", "🚀 Space Computing", "icon", "fa-solid fa-rocket", "fact",
                    "The Apollo 11 Lunar Module guidance computer had only 4KB of RAM and ran at 1.024 MHz!"));

    private static final List<Map<String, String>> WORLD_WONDERS_POOL = List.of(
            Map.of("category", "🏛️ Ancient Engineering", "icon", "fa-solid fa-landmark-dome", "wonder",
                    "The Great Pyramid of Giza was constructed with over 2.3 million giant stone blocks fitting together razor-sharp!"),
            Map.of("category", "🌊 Deep Ocean Secrets", "icon", "fa-solid fa-water", "wonder",
                    "The Mariana Trench is 11,000 meters deep—placing Mount Everest inside leaves 2km of ocean water above it!"),
            Map.of("category", "🍯 Biological Marvels", "icon", "fa-solid fa-jar", "wonder",
                    "Honey never spoils! Archaeologists found 3,000-year-old Egyptian honey pots that are still perfectly edible!"),
            Map.of("category", "🐋 Wildlife Records", "icon", "fa-solid fa-fish", "wonder",
                    "A Blue Whale's heart weighs 400 lbs and its heartbeat can be detected 2 miles underwater!"),
            Map.of("category", "⚡ Natural Phenomena", "icon", "fa-solid fa-bolt-lightning", "wonder",
                    "Lightning strikes Planet Earth approximately 8.6 million times every single day!"),
            Map.of("category", "🧠 Brain Mysteries", "icon", "fa-solid fa-brain", "wonder",
                    "The human brain generates about 20 watts of electrical power when awake—enough to power an LED light bulb!"),
            Map.of("category", "🌲 Nature Curiosities", "icon", "fa-solid fa-tree", "wonder",
                    "There are more trees on Earth (~3 trillion) than there are stars in the Milky Way galaxy (~100 billion)!"),
            Map.of("category", "🌋 Geological Wonders", "icon", "fa-solid fa-mountain-sun", "wonder",
                    "Mount Everest grows about 4mm taller every single year due to ongoing continental plate collision!"));

    @GetMapping("/public/facts/tech/random")
    public ResponseEntity<?> getRandomTechFact() {
        if (settingsService.isSec2ApiEnabled()) {
            settingsService.incrementSec2ApiCount();
            try {
                org.springframework.web.client.RestTemplate rest = new org.springframework.web.client.RestTemplate();
                @SuppressWarnings("unchecked")
                Map<String, Object> resp = rest.getForObject("https://uselessfacts.jsph.pl/api/v2/facts/random",
                        Map.class);
                if (resp != null && resp.containsKey("text")) {
                    Map<String, Object> factMap = new HashMap<>();
                    factMap.put("category", "⚡ Random Fact");
                    factMap.put("icon", "fa-solid fa-wand-magic-sparkles");
                    factMap.put("fact", resp.get("text").toString());
                    factMap.put("id",
                            resp.get("id") != null ? resp.get("id").toString() : "api-" + System.currentTimeMillis());
                    return ResponseEntity.ok(factMap);
                }
            } catch (Exception ignored) {
            }
        }

        Map<String, String> picked = TECH_FACTS_POOL
                .get(java.util.concurrent.ThreadLocalRandom.current().nextInt(TECH_FACTS_POOL.size()));
        Map<String, Object> fallback = new HashMap<>(picked);
        fallback.put("id", "pool-" + System.currentTimeMillis() + "-"
                + java.util.concurrent.ThreadLocalRandom.current().nextInt(1000));
        return ResponseEntity.ok(fallback);
    }

    @GetMapping("/public/facts/world/random")
    public ResponseEntity<?> getRandomWorldWonder() {
        if (settingsService.isSec3ApiEnabled()) {
            settingsService.incrementSec3ApiCount();
            try {
                org.springframework.web.client.RestTemplate rest = new org.springframework.web.client.RestTemplate();
                @SuppressWarnings("unchecked")
                Map<String, Object> resp = rest.getForObject("https://uselessfacts.jsph.pl/api/v2/facts/random",
                        Map.class);
                if (resp != null && resp.containsKey("text")) {
                    Map<String, Object> wonderMap = new HashMap<>();
                    wonderMap.put("category", "🌍 Global Discovery & Wonder");
                    wonderMap.put("icon", "fa-solid fa-earth-americas");
                    wonderMap.put("wonder", resp.get("text").toString());
                    wonderMap.put("id",
                            resp.get("id") != null ? resp.get("id").toString() : "api-w-" + System.currentTimeMillis());
                    return ResponseEntity.ok(wonderMap);
                }
            } catch (Exception ignored) {
            }
        }

        Map<String, String> picked = WORLD_WONDERS_POOL
                .get(java.util.concurrent.ThreadLocalRandom.current().nextInt(WORLD_WONDERS_POOL.size()));
        Map<String, Object> fallback = new HashMap<>(picked);
        fallback.put("id", "pool-w-" + System.currentTimeMillis() + "-"
                + java.util.concurrent.ThreadLocalRandom.current().nextInt(1000));
        return ResponseEntity.ok(fallback);
    }

    // Projects CRUD
    @PostMapping("/projects")
    public ResponseEntity<?> createProject(@RequestBody Map<String, String> body) {
        String name = body.get("name");
        if (name == null || name.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Project name is required");
        }
        try {
            Project project = projectService.createProject(name);
            return ResponseEntity.ok(project);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @GetMapping("/projects")
    public ResponseEntity<List<Project>> listProjects() {
        return ResponseEntity.ok(projectService.listProjects());
    }

    @GetMapping("/projects/{id}")
    public ResponseEntity<Project> getProject(@PathVariable Long id) {
        return projectService.getProject(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/projects/{id}")
    public ResponseEntity<?> deleteProject(@PathVariable Long id) {
        try {
            projectService.deleteProject(id);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @DeleteMapping("/scans/{scanId}")
    public ResponseEntity<?> deleteScan(@PathVariable Long scanId) {
        try {
            projectService.deleteScan(scanId);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    // Scans Management
    @PostMapping("/projects/{projectId}/scans")
    public ResponseEntity<?> startScan(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        String scanName = (String) body.getOrDefault("name", "");
        String url = (String) body.get("url");

        if (url == null || url.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("URL is required");
        }

        Integer maxPages = null;
        if (body.containsKey("maxPages") && body.get("maxPages") != null) {
            maxPages = Integer.parseInt(body.get("maxPages").toString());
        }

        Integer crawlDepth = null;
        if (body.containsKey("crawlDepth") && body.get("crawlDepth") != null) {
            crawlDepth = Integer.parseInt(body.get("crawlDepth").toString());
        }

        try {
            Scan scan = projectService.createScan(projectId, scanName, url, maxPages, crawlDepth);
            crawlScanService.startScanAsync(scan.getId());

            Map<String, Object> response = new HashMap<>();
            response.put("scanId", scan.getId());
            response.put("status", scan.getStatus());
            response.put("message", "Scan started asynchronously");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }

    @GetMapping("/projects/{projectId}/scans")
    public ResponseEntity<List<Scan>> listScans(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectService.listScans(projectId));
    }

    @GetMapping("/scans/{scanId}")
    public ResponseEntity<Scan> getScan(@PathVariable Long scanId) {
        return projectService.getScan(scanId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/scans/{scanId}/cancel")
    public ResponseEntity<?> cancelScan(@PathVariable Long scanId) {
        crawlScanService.cancelScan(scanId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/scans/active")
    public ResponseEntity<?> getActiveScan() {
        List<Scan> activeScans = projectService.getActiveScans();

        Scan active = null;
        for (Scan scan : activeScans) {
            if (crawlScanService.isScanRunning(scan.getId())) {
                active = scan;
                break;
            } else {
                try {
                    scan.setStatus("STOPPED");
                    scan.setEndedAt(java.time.LocalDateTime.now());
                    projectService.saveScan(scan);
                } catch (Exception e) {
                    // Log error or ignore
                }
            }
        }

        if (active == null) {
            Map<String, Object> result = new HashMap<>();
            result.put("active", false);
            return ResponseEntity.ok(result);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("active", true);
        result.put("scanId", active.getId());
        result.put("projectId", active.getProject().getId());
        result.put("projectName", active.getProject().getName());
        result.put("url", active.getUrl());
        result.put("status", active.getStatus());
        result.put("pagesScanned", active.getPagesScanned());
        result.put("wordsChecked", active.getWordsChecked());
        result.put("totalIssues", active.getTotalIssues());

        Integer maxPages = active.getMaxPages();
        result.put("maxPages", maxPages != null ? maxPages : 100);

        return ResponseEntity.ok(result);
    }

    @GetMapping("/scans/{scanId}/issues")
    public ResponseEntity<List<Issue>> getScanIssues(@PathVariable Long scanId) {
        return ResponseEntity.ok(issueRepository.findByScanIdAndRemovedFalse(scanId));
    }

    @PostMapping("/issues/{id}/remove")
    public ResponseEntity<?> removeIssue(@PathVariable Long id) {
        return issueRepository.findById(id).map(issue -> {
            issue.setRemoved(true);
            issueRepository.save(issue);

            // Recalculate and update total active issues on the Scan
            Scan scan = issue.getScan();
            if (scan != null) {
                long activeCount = issueRepository.countByScanIdAndRemovedFalse(scan.getId());
                scan.setTotalIssues((int) activeCount);
                projectService.saveScan(scan);
            }
            return ResponseEntity.ok().build();
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/scans/{scanId}/export/csv")
    public void exportCsv(@PathVariable Long scanId, HttpServletResponse response) throws Exception {
        response.setContentType("text/csv");
        response.setHeader("Content-Disposition", "attachment; filename=\"scan_" + scanId + "_issues.csv\"");

        List<Issue> issues = issueRepository.findByScanIdAndRemovedFalse(scanId);

        PrintWriter writer = response.getWriter();
        writer.println("Spelling Mistake Word,Expected Correct Word,Page URL,Page Title,Sentence");

        for (Issue issue : issues) {
            writer.println(String.format("\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"",
                    escapeCsv(issue.getWord()),
                    escapeCsv(getPrimarySuggestion(issue.getSuggestedText())),
                    escapeCsv(issue.getPageUrl()),
                    escapeCsv(issue.getPageTitle()),
                    escapeCsv(formatSentenceWithHighlight(issue.getFullSentence(), issue.getWord()))));
        }
        writer.flush();
    }

    @GetMapping("/scans/{scanId}/export/excel")
    public void exportExcel(@PathVariable Long scanId, HttpServletResponse response) throws Exception {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=\"scan_" + scanId + "_issues.xlsx\"");

        List<Issue> issues = issueRepository.findByScanIdAndRemovedFalse(scanId);

        try (Workbook workbook = new XSSFWorkbook();
                java.io.OutputStream out = response.getOutputStream()) {

            Sheet sheet = workbook.createSheet("Spelling Issues");

            Row header = sheet.createRow(0);
            String[] columns = { "Spelling Mistake Word", "Expected Correct Word", "Page URL", "Page Title",
                    "Sentence" };

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            for (int i = 0; i < columns.length; i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(columns[i]);
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (Issue issue : issues) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(issue.getWord());
                row.createCell(1).setCellValue(getPrimarySuggestion(issue.getSuggestedText()));
                row.createCell(2).setCellValue(issue.getPageUrl());
                row.createCell(3).setCellValue(issue.getPageTitle());
                row.createCell(4).setCellValue(formatSentenceWithHighlight(issue.getFullSentence(), issue.getWord()));
            }

            for (int i = 0; i < columns.length; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            out.flush();
        }
    }

    private String getPrimarySuggestion(String suggestedText) {
        if (suggestedText == null || suggestedText.trim().isEmpty()) {
            return "";
        }
        String[] parts = suggestedText.split(",");
        if (parts.length > 0) {
            return parts[0].trim();
        }
        return suggestedText.trim();
    }

    private String formatSentenceWithHighlight(String sentence, String word) {
        if (sentence == null || sentence.isEmpty() || word == null || word.isEmpty()) {
            return sentence != null ? sentence : "";
        }
        String escapedWord = java.util.regex.Pattern.quote(word);
        return sentence.replaceAll("(?i)(" + escapedWord + ")", "**$1**");
    }

    private String escapeCsv(String val) {
        if (val == null)
            return "";
        return val.replace("\"", "\"\"");
    }

    // SSE Stream
    @GetMapping(value = "/scans/{scanId}/stream", produces = "text/event-stream")
    public SseEmitter streamScanProgress(@PathVariable Long scanId) {
        return liveLogService.register(scanId);
    }

    // Standalone Groq Test Endpoint
    @GetMapping("/groq-test")
    public ResponseEntity<?> testGroq() {
        try {
            String result = spellingValidator.testGroqWithWord("Playwrigt");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(e.getMessage());
        }
    }
}
