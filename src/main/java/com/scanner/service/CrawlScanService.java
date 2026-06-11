package com.scanner.service;

import com.scanner.model.*;
import com.scanner.repository.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.languagetool.JLanguageTool;
import org.languagetool.language.AmericanEnglish;
import org.languagetool.rules.RuleMatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class CrawlScanService {

    private static final Logger logger = LoggerFactory.getLogger(CrawlScanService.class);

    private final ProjectRepository projectRepository;
    private final ScanRepository scanRepository;
    private final ScannedPageRepository scannedPageRepository;
    private final IssueRepository issueRepository;
    private final LiveLogService liveLogService;
    private final SpellingValidator spellingValidator;

    // Track active running scans to support cancellation
    private final Map<Long, Boolean> scanCancellationTokens = new ConcurrentHashMap<>();

    // Track audit reports for each scan session
    private final Map<Long, AuditReportCollector> scanAuditCollectors = new ConcurrentHashMap<>();

    @Value("${app.projects-dir:C:/Users/suppo/Auto-Checker/Projects}")
    private String projectsDir;

    @Autowired
    public CrawlScanService(ProjectRepository projectRepository,
            ScanRepository scanRepository,
            ScannedPageRepository scannedPageRepository,
            IssueRepository issueRepository,
            LiveLogService liveLogService,
            SpellingValidator spellingValidator) {
        this.projectRepository = projectRepository;
        this.scanRepository = scanRepository;
        this.scannedPageRepository = scannedPageRepository;
        this.issueRepository = issueRepository;
        this.liveLogService = liveLogService;
        this.spellingValidator = spellingValidator;
    }

    public static class RawFinding {
        public final String word;
        public final String suggestions;
        public final String sentence;
        public final String pageUrl;
        public final String pageTitle;

        public RawFinding(String word, String suggestions, String sentence, String pageUrl, String pageTitle) {
            this.word = word;
            this.suggestions = suggestions;
            this.sentence = sentence;
            this.pageUrl = pageUrl;
            this.pageTitle = pageTitle;
        }
    }

    // -------------------------------------------------------------------------
    // Helper logging
    // -------------------------------------------------------------------------
    private void logInfo(Long scanId, String msg, PrintWriter writer) {
        liveLogService.log(scanId, msg);
        if (writer != null) {
            writer.println(LocalDateTime.now() + " [INFO] " + msg);
            writer.flush();
        }
    }

    private void logError(Long scanId, String msg, PrintWriter writer) {
        liveLogService.log(scanId, "[ERROR] " + msg);
        if (writer != null) {
            writer.println(LocalDateTime.now() + " [ERROR] " + msg);
            writer.flush();
        }
    }

    // -------------------------------------------------------------------------
    // Cancellation
    // -------------------------------------------------------------------------
    public void cancelScan(Long scanId) {
        scanCancellationTokens.put(scanId, true);
        logger.info("Cancellation requested for scan {}", scanId);
    }

    public boolean isScanRunning(Long scanId) {
        return scanCancellationTokens.containsKey(scanId);
    }

    // -------------------------------------------------------------------------
    // Main async scan entry point
    // -------------------------------------------------------------------------
    @Async
    public void startScanAsync(Long scanId) {
        long totalScanStart = System.nanoTime();
        // Load scan record
        Scan scan = scanRepository.findById(scanId).orElse(null);
        if (scan == null) {
            logger.error("Scan with ID {} not found – aborting", scanId);
            return;
        }

        scan.setStatus("RUNNING");
        scan.setStartedAt(LocalDateTime.now());
        long dbStart = System.nanoTime();
        scanRepository.save(scan);
        long dbTime = (System.nanoTime() - dbStart) / 1_000_000;
        PerformanceTracker.add("db_save", dbTime);
        System.out.println("[PERF] Database Save Time = " + dbTime + " ms");

        final PrintWriter finalLogWriter = null;

        // Crawl counters
        AtomicInteger pagesScannedCount = new AtomicInteger(0);
        AtomicLong wordsCheckedCount = new AtomicLong(0);
        AtomicInteger totalIssuesCount = new AtomicInteger(0);

        // List of all findings found in the entire crawl
        List<RawFinding> rawFindings = new ArrayList<>();

        // Initialize audit report collector
        AuditReportCollector collector = new AuditReportCollector(scanId);
        scanAuditCollectors.put(scanId, collector);

        int cacheCandidatesChecked = 0;
        int cacheHits = 0;
        int cacheMisses = 0;
        int cacheHitRate = 0;
        int groqCallsAvoided = 0;

        try {
            String baseUrlStr = scan.getUrl().trim();
            URI baseUri = new URI(baseUrlStr);
            String targetHost = baseUri.getHost();

            logInfo(scanId, "Starting scan for URL: " + baseUrlStr, finalLogWriter);

            // ---- robots.txt + sitemap ----
            Set<String> robotsDisallowedPrefixes = new HashSet<>();
            Set<String> sitemapUrls = new HashSet<>();
            fetchAndParseRobotsTxt(baseUrlStr, targetHost, robotsDisallowedPrefixes, sitemapUrls, scanId,
                    finalLogWriter);

            // ---- Build initial crawl queue ----
            Queue<CrawlTask> crawlQueue = new LinkedList<>();
            Set<String> visitedUrls = new HashSet<>();

            if (!sitemapUrls.isEmpty()) {
                logInfo(scanId, "Found " + sitemapUrls.size() + " URLs in sitemap.xml – queuing.", finalLogWriter);
                for (String sUrl : sitemapUrls) {
                    if (isInternalAndAllowed(sUrl, targetHost, robotsDisallowedPrefixes)) {
                        crawlQueue.add(new CrawlTask(sUrl, 0));
                    }
                }
            }
            if (crawlQueue.isEmpty()) {
                crawlQueue.add(new CrawlTask(baseUrlStr, 0));
            }

            scanCancellationTokens.put(scanId, false);
            
            // ---- Launch LanguageTool ----
            long ltInitStart = System.nanoTime();
            JLanguageTool langTool = new JLanguageTool(new AmericanEnglish());
            langTool.getAllRules().stream()
                    .filter(r -> !r.isDictionaryBasedSpellingRule()
                            && !r.getCategory().getId().toString().contains("TYPOS")
                            && !r.getCategory().getId().toString().contains("SPELLING")
                            && !r.getId().contains("MORFOLOGIK"))
                    .forEach(r -> langTool.disableRule(r.getId()));
            long ltInitTime = (System.nanoTime() - ltInitStart) / 1_000_000;
            PerformanceTracker.add("languagetool_init", ltInitTime);
            System.out.println("[PERF] LanguageTool Initialization = " + ltInitTime + " ms");
            logInfo(scanId, "[PERF] LanguageTool Initialization = " + ltInitTime + " ms", finalLogWriter);
            logInfo(scanId, "LanguageTool spell-checker initialised.", finalLogWriter);

            long crawlLoopStart = System.nanoTime();
            while (!crawlQueue.isEmpty()
                    && !scanCancellationTokens.getOrDefault(scanId, false)) {

                // Respect max-pages limit
                if (scan.getMaxPages() != null
                        && pagesScannedCount.get() >= scan.getMaxPages()) {
                    logInfo(scanId, "Reached max page limit (" + scan.getMaxPages() + "). Stopping crawler.",
                            finalLogWriter);
                    break;
                }

                CrawlTask task = crawlQueue.poll();
                if (task == null)
                    break;

                String currentUrl = task.url;
                int currentDepth = task.depth;

                if (!visitedUrls.add(currentUrl)) {
                    continue; // already visited
                }

                logInfo(scanId, "Scanning: " + currentUrl + " (depth=" + currentDepth + ")", finalLogWriter);

                try {
                    org.jsoup.Connection conn = Jsoup.connect(currentUrl)
                            .userAgent("Mozilla/5.0 AutoChecker/1.0")
                            .timeout(15000);

                    long fetchStart = System.nanoTime();
                    org.jsoup.Connection.Response response = conn.execute();
                    long fetchEnd = System.nanoTime();
                    long fetchTime = (fetchEnd - fetchStart) / 1_000_000;
                    PerformanceTracker.add("page_download", fetchTime);
                    System.out.println("[PERF] Page Download = " + fetchTime + " ms");
                    logInfo(scanId, "[PERF] Page Download = " + fetchTime + " ms", finalLogWriter);

                    long parseStart = System.nanoTime();
                    Document doc = response.parse();
                    long parseEnd = System.nanoTime();
                    long parseTime = (parseEnd - parseStart) / 1_000_000;
                    PerformanceTracker.add("html_parse", parseTime);
                    System.out.println("[PERF] HTML Parsing = " + parseTime + " ms");
                    logInfo(scanId, "[PERF] HTML Parsing = " + parseTime + " ms", finalLogWriter);

                    long textExtractStart = System.nanoTime();
                    String title = doc.title();
                    doc.select("script, style, noscript, svg, iframe").remove();

                    String extractedText = extractVisibleText(doc);
                    extractedText = normalizeBrokenWords(extractedText);
                    long wordCount = countWords(extractedText);
                    long textExtractTime = (System.nanoTime() - textExtractStart) / 1_000_000;
                    PerformanceTracker.add("text_extract", textExtractTime);
                    System.out.println("[PERF] Text Extraction = " + textExtractTime + " ms");
                    logInfo(scanId, "[PERF] Text Extraction = " + textExtractTime + " ms", finalLogWriter);
                    
                    wordsCheckedCount.addAndGet(wordCount);

                    savePage(scan, currentUrl, title, 200);
                    pagesScannedCount.incrementAndGet();

                    // Collect spelling findings in raw list
                    runSpellingCheck(doc, langTool, currentUrl, title, extractedText, rawFindings, scanId, finalLogWriter);

                    // Broadcast live progress (issues count remains 0 until processed later)
                    broadcastProgress(scanId, pagesScannedCount, wordsCheckedCount, totalIssuesCount, currentUrl);

                    // ---- Discover internal links ----
                    if (scan.getCrawlDepth() == null || currentDepth < scan.getCrawlDepth()) {
                        Elements links = doc.select("a[href]");
                        for (Element link : links) {
                            String absUrl = link.absUrl("href");
                            int hashIdx = absUrl.indexOf('#');
                            if (hashIdx != -1)
                                absUrl = absUrl.substring(0, hashIdx);
                            if (absUrl.endsWith("/"))
                                absUrl = absUrl.substring(0, absUrl.length() - 1);

                            if (isInternalAndAllowed(absUrl, targetHost, robotsDisallowedPrefixes)
                                    && !visitedUrls.contains(absUrl)) {
                                crawlQueue.add(new CrawlTask(absUrl, currentDepth + 1));
                            }
                        }
                    }

                } catch (Exception pageEx) {
                    logError(scanId, "Error processing " + currentUrl + ": " + pageEx.getMessage(), finalLogWriter);
                    savePage(scan, currentUrl, "Error", 500);
                    pagesScannedCount.incrementAndGet();
                    broadcastProgress(scanId, pagesScannedCount, wordsCheckedCount, totalIssuesCount, currentUrl);
                }
            }
            long crawlLoopEnd = System.nanoTime();
            long crawlLoopTime = (crawlLoopEnd - crawlLoopStart) / 1_000_000;
            PerformanceTracker.add("total_crawl", crawlLoopTime);
            System.out.println("[PERF] Total Crawl Time = " + crawlLoopTime + " ms");
            logInfo(scanId, "[PERF] Total Crawl Time = " + crawlLoopTime + " ms", finalLogWriter);

            // ---- Deduplicate findings globally ----
            logInfo(scanId, "Finished crawling. Total findings collected: " + rawFindings.size() + ". Deduplicating...",
                    finalLogWriter);

            int beforeCount = rawFindings.size();
            int afterNormCount = rawFindings.size();

            Map<String, SpellingValidator.SpellingCandidate> uniqueCandidates = new LinkedHashMap<>();
            Map<String, SpellingValidator.SpellingCandidate> candidateMap = new LinkedHashMap<>();

            long normTimeAccum = 0;
            long dedupTimeAccum = 0;
            for (RawFinding rf : rawFindings) {
                if (rf.word == null)
                    continue;

                long normStart = System.nanoTime();
                String normalized = rf.word.trim().toLowerCase(Locale.ROOT);
                String key = rf.word.toLowerCase() + "|" + rf.suggestions.toLowerCase();
                normTimeAccum += (System.nanoTime() - normStart);

                long dedupStart = System.nanoTime();
                SpellingValidator.SpellingCandidate candidate = uniqueCandidates.get(normalized);
                if (candidate == null) {
                    candidate = new SpellingValidator.SpellingCandidate(rf.word, rf.suggestions, rf.sentence);
                    uniqueCandidates.put(normalized, candidate);
                }
                candidateMap.put(key, candidate);
                dedupTimeAccum += (System.nanoTime() - dedupStart);
            }
            long normTimeMs = normTimeAccum / 1_000_000;
            long dedupTimeMs = dedupTimeAccum / 1_000_000;
            PerformanceTracker.add("candidate_norm", normTimeMs);
            PerformanceTracker.add("candidate_dedup", dedupTimeMs);
            System.out.println("[PERF] Candidate Normalization Time = " + normTimeMs + " ms");
            System.out.println("[PERF] Candidate Deduplication Time = " + dedupTimeMs + " ms");
            logInfo(scanId, "[PERF] Candidate Normalization Time = " + normTimeMs + " ms", finalLogWriter);
            logInfo(scanId, "[PERF] Candidate Deduplication Time = " + dedupTimeMs + " ms", finalLogWriter);

            int afterDeduplicationCount = uniqueCandidates.size();

            System.out.println("[GROQ] Candidates before normalization = " + beforeCount);
            System.out.println("[GROQ] Candidates after normalization = " + afterNormCount);
            System.out.println("[GROQ] Candidates after deduplication = " + afterDeduplicationCount);

            List<String> finalWords = new ArrayList<>();
            for (SpellingValidator.SpellingCandidate c : uniqueCandidates.values()) {
                finalWords.add(c.getWord());
            }
            System.out.println("[GROQ] Final candidate list: " + finalWords);

            logInfo(scanId, "[GROQ] Candidates before normalization = " + beforeCount, finalLogWriter);
            logInfo(scanId, "[GROQ] Candidates after normalization = " + afterNormCount, finalLogWriter);
            logInfo(scanId, "[GROQ] Candidates after deduplication = " + afterDeduplicationCount, finalLogWriter);
            logInfo(scanId, "[GROQ] Final candidate list: " + finalWords, finalLogWriter);

            long valStart = System.nanoTime();
            // ---- Local Cache Lookup ----
            logInfo(scanId, "Checking local SQLite cache for " + uniqueCandidates.size() + " unique candidates...",
                    finalLogWriter);
            long cacheStart = System.nanoTime();
            cacheCandidatesChecked = uniqueCandidates.size();
            for (SpellingValidator.SpellingCandidate candidate : uniqueCandidates.values()) {
                Optional<String> cachedDecision = spellingValidator.checkCache(candidate.getWord(),
                        candidate.getSuggestion());
                if (cachedDecision.isPresent()) {
                    candidate.setDecision(cachedDecision.get());
                    cacheHits++;
                }
            }
            long cacheEnd = System.nanoTime();
            cacheMisses = cacheCandidatesChecked - cacheHits;
            cacheHitRate = cacheCandidatesChecked > 0 ? (int) Math.round(((double) cacheHits / cacheCandidatesChecked) * 100) : 0;
            groqCallsAvoided = cacheHits;

            System.out.println("[CACHE] Candidates Checked = " + cacheCandidatesChecked);
            System.out.println("[CACHE] Cache Hits = " + cacheHits);
            System.out.println("[CACHE] Cache Misses = " + cacheMisses);
            System.out.println("[CACHE] Hit Rate = " + cacheHitRate + "%");
            System.out.println("[CACHE] Groq Calls Avoided = " + groqCallsAvoided);

            logInfo(scanId, "[CACHE] Candidates Checked = " + cacheCandidatesChecked, finalLogWriter);
            logInfo(scanId, "[CACHE] Cache Hits = " + cacheHits, finalLogWriter);
            logInfo(scanId, "[CACHE] Cache Misses = " + cacheMisses, finalLogWriter);
            logInfo(scanId, "[CACHE] Hit Rate = " + cacheHitRate + "%", finalLogWriter);
            logInfo(scanId, "[CACHE] Groq Calls Avoided = " + groqCallsAvoided, finalLogWriter);

            long cacheTime = (cacheEnd - cacheStart) / 1_000_000;
            PerformanceTracker.add("cache_lookup", cacheTime);
            System.out.println("[PERF] Cache Lookup Time = " + cacheTime + " ms");
            logInfo(scanId, "[PERF] Cache Lookup Time = " + cacheTime + " ms", finalLogWriter);

            // ---- Batch Groq Validation ----
            List<SpellingValidator.SpellingCandidate> unresolved = uniqueCandidates.values().stream()
                    .filter(c -> !"VALID".equals(c.getDecision()) && !"TYPO".equals(c.getDecision()))
                    .collect(Collectors.toList());

            if (!unresolved.isEmpty()) {
                logInfo(scanId, "Sending " + unresolved.size() + " unresolved candidates to Groq batch validator...",
                        finalLogWriter);
                spellingValidator.validateCandidatesBatch(unresolved, scanId, finalLogWriter);
            } else {
                logInfo(scanId,
                        "All candidates resolved via SQLite cache or space normalization. No Groq API calls needed.",
                        finalLogWriter);
            }
            long valEnd = System.nanoTime();
            long valTime = (valEnd - valStart) / 1_000_000;
            PerformanceTracker.add("total_validation", valTime);
            System.out.println("[PERF] Total Validation Time = " + valTime + " ms");
            logInfo(scanId, "[PERF] Total Validation Time = " + valTime + " ms", finalLogWriter);

            // ---- Populate Audit Report data ----
            for (SpellingValidator.SpellingCandidate candidate : candidateMap.values()) {
                String decision = candidate.getDecision();
                if ("VALID".equals(decision)) {
                    collector.recordDynamicIgnore(candidate.getWord(),
                            "Validated as VALID by "
                                    + (unresolved.contains(candidate) ? "Groq API" : "SQLite Cache/Space Normalization")
                                    + " (Reason: " + candidate.getReason() + ")");
                } else if ("TYPO".equals(decision)) {
                    collector.recordReported(candidate.getWord());
                } else {
                    collector.recordDynamicIgnore(candidate.getWord(), "Marked PENDING (validation failed or skipped)");
                }
            }

            // ---- Generate Database Issues ----
            logInfo(scanId, "Generating database issues for validated typos...", finalLogWriter);

            long issueGenStart = System.nanoTime();
            long dbSaveTimeInGen = 0;
            // Fetch all existing issues for the scan to perform case-insensitive in-memory
            // lookups
            List<Issue> existingIssues = issueRepository.findByScanId(scan.getId());
            Map<String, Issue> normalizedIssueMap = new HashMap<>();
            for (Issue issue : existingIssues) {
                if (issue.getWord() != null) {
                    normalizedIssueMap.put(issue.getWord().trim().toLowerCase(Locale.ROOT), issue);
                }
            }

            Set<String> generatedIssueKeys = new HashSet<>();
            int beforeDedup = 0;
            int afterDedup = 0;

            // Count before dedup
            for (RawFinding rf : rawFindings) {
                if (rf.word == null)
                    continue;
                String key = rf.word.toLowerCase() + "|" + rf.suggestions.toLowerCase();
                SpellingValidator.SpellingCandidate candidate = candidateMap.get(key);
                if (candidate != null && "TYPO".equalsIgnoreCase(candidate.getDecision())) {
                    beforeDedup++;
                }
            }

            for (RawFinding rf : rawFindings) {
                if (rf.word == null)
                    continue;
                String key = rf.word.toLowerCase() + "|" + rf.suggestions.toLowerCase();
                SpellingValidator.SpellingCandidate candidate = candidateMap.get(key);
                if (candidate != null && "TYPO".equalsIgnoreCase(candidate.getDecision())) {

                    String normalizedWord = rf.word.trim().toLowerCase(Locale.ROOT);
                    String normalizedPage = rf.pageUrl != null ? rf.pageUrl.trim().toLowerCase(Locale.ROOT) : "";
                    String normKey = normalizedWord + "|" + normalizedPage;

                    if (generatedIssueKeys.contains(normKey)) {
                        continue;
                    }
                    generatedIssueKeys.add(normKey);
                    afterDedup++;

                    try {
                        Issue existing = normalizedIssueMap.get(normalizedWord);
                        if (existing != null) {
                            String currentUrls = existing.getPageUrl();
                            if (currentUrls == null)
                                currentUrls = "";
                            Set<String> urlSet = new LinkedHashSet<>(Arrays.asList(currentUrls.split(",\\s*")));
                            if (urlSet.add(rf.pageUrl)) {
                                existing.setPageUrl(String.join(", ", urlSet));

                                long dbSaveStart = System.nanoTime();
                                issueRepository.save(existing);
                                long dbSaveEnd = System.nanoTime();
                                dbSaveTimeInGen += (dbSaveEnd - dbSaveStart);

                                logInfo(scanId, "Typo \"" + rf.word + "\" also found on " + rf.pageUrl, finalLogWriter);
                            }
                        } else {
                            Issue issue = new Issue();
                            issue.setScan(scan);
                            issue.setWord(rf.word); // preserve original occurrence casing
                            issue.setSuggestedText(rf.suggestions);
                            issue.setPageUrl(rf.pageUrl);
                            issue.setPageTitle(rf.pageTitle != null ? rf.pageTitle : "");
                            issue.setDomElement("N/A");
                            issue.setFullSentence(rf.sentence);
                            issue.setTextSnippet("");
                            issue.setHtmlTag("Unknown");
                            issue.setDetectionSource("N/A");

                            long dbSaveStart = System.nanoTime();
                            Issue savedIssue = issueRepository.save(issue);
                            long dbSaveEnd = System.nanoTime();
                            dbSaveTimeInGen += (dbSaveEnd - dbSaveStart);

                            normalizedIssueMap.put(normalizedWord, savedIssue);

                            totalIssuesCount.incrementAndGet();
                            logInfo(scanId, "Typo found: \"" + rf.word + "\" on " + rf.pageUrl, finalLogWriter);
                        }
                    } catch (Exception saveEx) {
                        logger.error("Failed to save/update issue for word '{}': {}", rf.word, saveEx.getMessage());
                    }
                }
            }
            long issueGenEnd = System.nanoTime();

            long dbSaveMs = dbSaveTimeInGen / 1_000_000;
            PerformanceTracker.add("db_save", dbSaveMs);
            System.out.println("[PERF] Database Save Time = " + dbSaveMs + " ms");
            logInfo(scanId, "[PERF] Database Save Time = " + dbSaveMs + " ms", finalLogWriter);

            long totalIssueGenMs = (issueGenEnd - issueGenStart) / 1_000_000;
            long issueGenMs = totalIssueGenMs - dbSaveMs;
            PerformanceTracker.add("issue_gen", issueGenMs);
            System.out.println("[PERF] Issue Generation Time = " + issueGenMs + " ms");
            logInfo(scanId, "[PERF] Issue Generation Time = " + issueGenMs + " ms", finalLogWriter);

            System.out.println("[ISSUE] Issue generation before dedup = " + beforeDedup);
            System.out.println("[ISSUE] Issue generation after dedup = " + afterDedup);

            logInfo(scanId, "[ISSUE] Issue generation before dedup = " + beforeDedup, finalLogWriter);
            logInfo(scanId, "[ISSUE] Issue generation after dedup = " + afterDedup, finalLogWriter);

            // Calculate and log final validation statistics
            int validFindings = 0;
            int typoFindings = 0;
            int pendingFindings = 0;
            for (RawFinding rf : rawFindings) {
                String key = rf.word.toLowerCase() + "|" + rf.suggestions.toLowerCase();
                SpellingValidator.SpellingCandidate candidate = candidateMap.get(key);
                if (candidate != null) {
                    String decision = candidate.getDecision();
                    if ("VALID".equalsIgnoreCase(decision)) {
                        validFindings++;
                    } else if ("TYPO".equalsIgnoreCase(decision)) {
                        typoFindings++;
                    } else {
                        pendingFindings++;
                    }
                } else {
                    pendingFindings++;
                }
            }

            logInfo(scanId, "LanguageTool Findings: " + rawFindings.size(), finalLogWriter);
            logInfo(scanId, "Validated TYPO: " + typoFindings, finalLogWriter);
            logInfo(scanId, "Validated VALID: " + validFindings, finalLogWriter);
            logInfo(scanId, "Pending Validation: " + pendingFindings, finalLogWriter);

            // Broadcast final status update
            broadcastProgress(scanId, pagesScannedCount, wordsCheckedCount, totalIssuesCount, "Scan complete");

            // ---- Determine final status ----
            if (scanCancellationTokens.getOrDefault(scanId, false)) {
                scan.setStatus("STOPPED");
                logInfo(scanId, "Scan stopped by user.", finalLogWriter);
            } else {
                scan.setStatus("COMPLETED");
                logInfo(scanId, "Scan completed. Pages=" + pagesScannedCount.get()
                        + " Issues=" + totalIssuesCount.get(), finalLogWriter);
            }

        } catch (Exception e) {
            logger.error("Scan {} failed with exception: ", scanId, e);
            scan.setStatus("FAILED");
            logError(scanId, "Scan failed: " + e.getMessage(), finalLogWriter);
        } finally {
            scan.setEndedAt(LocalDateTime.now());
            scan.setPagesScanned(pagesScannedCount.get());
            scan.setWordsChecked(wordsCheckedCount.get());
            scan.setTotalIssues(totalIssuesCount.get());

            long dbStartFinally = System.nanoTime();
            scanRepository.save(scan);
            long dbTimeFinally = (System.nanoTime() - dbStartFinally) / 1_000_000;
            PerformanceTracker.add("db_save", dbTimeFinally);
            System.out.println("[PERF] Database Save Time = " + dbTimeFinally + " ms");
            logInfo(scanId, "[PERF] Database Save Time = " + dbTimeFinally + " ms", finalLogWriter);

            // Generate dynamic entity validation audit report
            long reportStart = System.nanoTime();
            AuditReportCollector scanCollector = scanAuditCollectors.remove(scanId);
            if (scanCollector != null) {
                scanCollector.writeReport("AuditReports");
                logInfo(scanId,
                        "Generated Dynamic Entity Audit Report at: AuditReports/audit_report_scan_" + scanId + ".txt",
                        finalLogWriter);
            }
            long reportEnd = System.nanoTime();
            long reportTime = (reportEnd - reportStart) / 1_000_000;
            PerformanceTracker.add("report_gen", reportTime);
            System.out.println("[PERF] Report Generation Time = " + reportTime + " ms");
            logInfo(scanId, "[PERF] Report Generation Time = " + reportTime + " ms", finalLogWriter);

            long totalPersistenceTime = PerformanceTracker.get("db_save") + PerformanceTracker.get("report_gen");
            PerformanceTracker.add("total_persistence", totalPersistenceTime);
            System.out.println("[PERF] Total Persistence Time = " + totalPersistenceTime + " ms");
            logInfo(scanId, "[PERF] Total Persistence Time = " + totalPersistenceTime + " ms", finalLogWriter);

            long totalScanEnd = System.nanoTime();
            long totalScanTime = (totalScanEnd - totalScanStart) / 1_000_000;
            PerformanceTracker.add("total_scan", totalScanTime);
            logInfo(scanId, "[PERF] Total Scan Time = " + totalScanTime + " ms", finalLogWriter);
            // Print summary
            long pagesCrawled = pagesScannedCount.get();
            Map<String, Long> summaryMap = new LinkedHashMap<>();
            summaryMap.put("robots.txt Fetch", PerformanceTracker.get("robots_txt_fetch"));
            summaryMap.put("Sitemap Fetch", PerformanceTracker.get("sitemap_fetch"));
            summaryMap.put("Page Download", PerformanceTracker.get("page_download"));
            summaryMap.put("HTML Parsing", PerformanceTracker.get("html_parse"));
            summaryMap.put("Text Extraction", PerformanceTracker.get("text_extract"));
            summaryMap.put("LanguageTool Initialization", PerformanceTracker.get("languagetool_init"));
            summaryMap.put("LanguageTool Processing", PerformanceTracker.get("languagetool_processing"));
            summaryMap.put("Candidate Extraction", PerformanceTracker.get("candidate_extract"));
            summaryMap.put("Normalization", PerformanceTracker.get("candidate_norm"));
            summaryMap.put("Deduplication", PerformanceTracker.get("candidate_dedup"));
            summaryMap.put("Cache Lookup", PerformanceTracker.get("cache_lookup"));
            summaryMap.put("Groq Request Preparation", PerformanceTracker.get("groq_prep"));
            summaryMap.put("Groq API", PerformanceTracker.get("groq_api"));
            summaryMap.put("Groq Response Parsing", PerformanceTracker.get("groq_parse"));
            summaryMap.put("Issue Generation", PerformanceTracker.get("issue_gen"));
            summaryMap.put("Database Save", PerformanceTracker.get("db_save"));
            summaryMap.put("Report Generation", PerformanceTracker.get("report_gen"));
 
            long sumOfComponents = 0;
            for (long val : summaryMap.values()) {
                sumOfComponents += val;
            }
            long unaccountedTime = totalScanTime - sumOfComponents;
            summaryMap.put("Unaccounted Time", unaccountedTime);
 
            List<Map.Entry<String, Long>> sortedMetrics = new ArrayList<>(summaryMap.entrySet());
            sortedMetrics.sort((a, b) -> b.getValue().compareTo(a.getValue()));
 
            System.out.println("================ PERFORMANCE SUMMARY ================");
            System.out.println("[PERF] Pages Crawled = " + pagesCrawled);
            for (Map.Entry<String, Long> entry : sortedMetrics) {
                System.out.println("[PERF] " + entry.getKey() + " = " + entry.getValue() + " ms");
            }
            System.out.println("");
            System.out.println("[PERF] Total Scan Time = " + totalScanTime + " ms");
            System.out.println("=====================================================");
 
            logInfo(scanId, "================ PERFORMANCE SUMMARY ================", finalLogWriter);
            logInfo(scanId, "[PERF] Pages Crawled = " + pagesCrawled, finalLogWriter);
            for (Map.Entry<String, Long> entry : sortedMetrics) {
                logInfo(scanId, "[PERF] " + entry.getKey() + " = " + entry.getValue() + " ms", finalLogWriter);
            }
            logInfo(scanId, "", finalLogWriter);
            logInfo(scanId, "[PERF] Total Scan Time = " + totalScanTime + " ms", finalLogWriter);
            logInfo(scanId, "=====================================================", finalLogWriter);

            System.out.println("================ CACHE SUMMARY ================");
            System.out.println();
            System.out.println("[CACHE] Candidates Checked = " + cacheCandidatesChecked);
            System.out.println("[CACHE] Cache Hits = " + cacheHits);
            System.out.println("[CACHE] Cache Misses = " + cacheMisses);
            System.out.println("[CACHE] Hit Rate = " + cacheHitRate + "%");
            System.out.println("[CACHE] Groq Calls Avoided = " + groqCallsAvoided);
            System.out.println();
            System.out.println("================================================");

            logInfo(scanId, "================ CACHE SUMMARY ================", finalLogWriter);
            logInfo(scanId, "", finalLogWriter);
            logInfo(scanId, "[CACHE] Candidates Checked = " + cacheCandidatesChecked, finalLogWriter);
            logInfo(scanId, "[CACHE] Cache Hits = " + cacheHits, finalLogWriter);
            logInfo(scanId, "[CACHE] Cache Misses = " + cacheMisses, finalLogWriter);
            logInfo(scanId, "[CACHE] Hit Rate = " + cacheHitRate + "%", finalLogWriter);
            logInfo(scanId, "[CACHE] Groq Calls Avoided = " + groqCallsAvoided, finalLogWriter);
            logInfo(scanId, "", finalLogWriter);
            logInfo(scanId, "================================================", finalLogWriter);

            scanCancellationTokens.remove(scanId);

            if (finalLogWriter != null) {
                finalLogWriter.close();
            }
            liveLogService.close(scanId);
            PerformanceTracker.clear();
        }
    }

    // -------------------------------------------------------------------------
    // Persist a scanned page record
    // -------------------------------------------------------------------------
    private void savePage(Scan scan, String url, String title, int statusCode) {
        try {
            long dbStart = System.nanoTime();
            scannedPageRepository.save(new ScannedPage(scan, url, title, statusCode));
            long dbTime = (System.nanoTime() - dbStart) / 1_000_000;
            PerformanceTracker.add("db_save", dbTime);
            System.out.println("[PERF] Database Save Time = " + dbTime + " ms");
        } catch (Exception e) {
            logger.error("Failed to save scanned page {}: {}", url, e.getMessage());
        }
    }
    // Spelling check + save issues
    // -------------------------------------------------------------------------
    private void runSpellingCheck(Document doc, JLanguageTool langTool,
            String pageUrl, String pageTitle, String text,
            List<RawFinding> rawFindings, Long scanId, PrintWriter logWriter) {
        if (text == null || text.trim().isEmpty())
            return;

        int rawTokensCount = 0;
        int preFilteredTokensCount = 0;
        int tokensRemovedCount = 0;

        StringBuilder sb = new StringBuilder(text);
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\S+");
        java.util.regex.Matcher matcher = pattern.matcher(text);

        while (matcher.find()) {
            rawTokensCount++;
            String token = matcher.group();
            if (shouldPreFilter(token)) {
                tokensRemovedCount++;
                for (int i = matcher.start(); i < matcher.end(); i++) {
                    sb.setCharAt(i, ' ');
                }
            } else {
                preFilteredTokensCount++;
            }
        }
        String filteredText = sb.toString();

        try {
            long ltStart = System.nanoTime();
            List<RuleMatch> matches = langTool.check(filteredText);
            long ltEnd = System.nanoTime();
            long ltTime = (ltEnd - ltStart) / 1_000_000;
            PerformanceTracker.add("languagetool_processing", ltTime);
            System.out.println("[PERF] LanguageTool Processing = " + ltTime + " ms");
            logInfo(scanId, "[PERF] LanguageTool Processing = " + ltTime + " ms", logWriter);

            int languageToolCandidatesCount = 0;

            long extractStart = System.nanoTime();
            for (RuleMatch match : matches) {
                // Only spelling/typo categories
                String catId = match.getRule().getCategory().getId().toString();
                boolean isSpelling = match.getRule().isDictionaryBasedSpellingRule()
                        || catId.contains("TYPOS")
                        || catId.contains("SPELLING")
                        || match.getRule().getId().contains("MORFOLOGIK");
                if (!isSpelling)
                    continue;

                languageToolCandidatesCount++;

                int fromPos = match.getFromPos();
                int toPos = match.getToPos();
                if (fromPos < 0 || toPos > text.length() || fromPos >= toPos)
                    continue;

                String word = text.substring(fromPos, toPos).trim();
                if (word.isEmpty())
                    continue;

                // Skip pure numbers and very short tokens (length <= 1)
                if (word.matches("\\d+") || word.length() <= 1) {
                    continue;
                }

                String suggestions = match.getSuggestedReplacements().stream()
                        .limit(3)
                        .collect(Collectors.joining(", "));
                String primarySuggestion = match.getSuggestedReplacements().isEmpty() ? ""
                        : match.getSuggestedReplacements().get(0);

                // Space-Normalization Filter
                if (isSpaceNormalizedEqual(word, primarySuggestion) || isSpaceNormalizedEqual(word, suggestions)) {
                    continue; // Treat as VALID, skip reporting / Groq validation
                }

                // Context sentence (clean HTML tags) - Optimized and truncated
                String sentence = extractSentence(text, word, fromPos, toPos);

                rawFindings.add(new RawFinding(word, suggestions, sentence, pageUrl, pageTitle));
            }
            long extractEnd = System.nanoTime();
            long extractTime = (extractEnd - extractStart) / 1_000_000;
            PerformanceTracker.add("candidate_extract", extractTime);
            System.out.println("[PERF] Candidate Extraction Time = " + extractTime + " ms");
            logInfo(scanId, "[PERF] Candidate Extraction Time = " + extractTime + " ms", logWriter);

            System.out.println("[PERF] Raw Text Tokens = " + rawTokensCount);
            System.out.println("[PERF] Pre-Filtered Tokens = " + preFilteredTokensCount);
            System.out.println("[PERF] LanguageTool Candidates = " + languageToolCandidatesCount);
            System.out.println("[PERF] Tokens Removed Before LanguageTool = " + tokensRemovedCount);

            logInfo(scanId, "[PERF] Raw Text Tokens = " + rawTokensCount, logWriter);
            logInfo(scanId, "[PERF] Pre-Filtered Tokens = " + preFilteredTokensCount, logWriter);
            logInfo(scanId, "[PERF] LanguageTool Candidates = " + languageToolCandidatesCount, logWriter);
            logInfo(scanId, "[PERF] Tokens Removed Before LanguageTool = " + tokensRemovedCount, logWriter);
        } catch (Exception e) {
            logger.error("Spell-check error on {}: {}", pageUrl, e.getMessage());
        }
    }

    private static boolean shouldPreFilter(String token) {
        if (token == null)
            return true;
        String t = token.trim();
        if (t.isEmpty())
            return true;

        // Values containing no alphabetic characters
        if (!t.matches(".*[a-zA-Z].*")) {
            return true;
        }

        // URLs
        if (t.toLowerCase().startsWith("http://") || 
            t.toLowerCase().startsWith("https://") || 
            t.toLowerCase().startsWith("www.") ||
            t.toLowerCase().startsWith("file://") ||
            t.matches("(?i)^[a-z0-9]+([\\-\\.]{1}[a-z0-9]+)*\\.[a-z]{2,5}(:[0-9]{1,5})?(\\/.*)?$") ||
            t.contains("localhost:")) {
            return true;
        }

        // Email addresses
        if (t.matches("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}$")) {
            return true;
        }

        // HTML tags
        if (t.startsWith("<") && t.endsWith(">")) {
            return true;
        }

        // JSON blobs
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            return true;
        }

        // Base64 content & extremely long machine-generated tokens
        if (t.length() > 30) {
            return true;
        }

        // Script / Style content fragments
        if (t.contains("javascript:") || t.contains("console.log") || t.contains("function(") || t.contains("var ") || t.contains("const ") || t.contains("let ")) {
            return true;
        }

        return false;
    }

    private static boolean isSpaceNormalizedEqual(String word, String suggestion) {
        if (word == null || suggestion == null)
            return false;
        String w = word.replaceAll("\\s+", "").toLowerCase();
        String s = suggestion.replaceAll("\\s+", "").toLowerCase();
        return w.equals(s);
    }

    public String extractSentence(String text, String word, int fromPos, int toPos) {
        if (text == null || text.isEmpty() || fromPos < 0 || toPos > text.length() || fromPos >= toPos) {
            return word;
        }

        int startBoundary = -1;
        int endBoundary = -1;

        // Scan backwards from fromPos to find sentence start boundary
        for (int i = fromPos - 1; i >= 0; i--) {
            char c = text.charAt(i);
            if (c == '\n' || c == '\r') {
                startBoundary = i + 1;
                break;
            }
            if ((c == '.' || c == '?' || c == '!') && i + 1 < text.length()
                    && Character.isWhitespace(text.charAt(i + 1))) {
                startBoundary = i + 1;
                break;
            }
        }

        // Scan forwards from toPos to find sentence end boundary
        for (int j = toPos; j < text.length(); j++) {
            char c = text.charAt(j);
            if (c == '\n' || c == '\r') {
                endBoundary = j;
                break;
            }
            if ((c == '.' || c == '?' || c == '!')
                    && (j + 1 == text.length() || Character.isWhitespace(text.charAt(j + 1)))) {
                endBoundary = j + 1;
                break;
            }
        }

        boolean hasStart = (startBoundary != -1);
        boolean hasEnd = (endBoundary != -1);

        String sentence;
        int wordIdx;
        int wordEndIdx;

        if (hasStart || hasEnd) {
            int start = hasStart ? startBoundary : 0;
            int end = hasEnd ? endBoundary : text.length();

            String prefix = text.substring(start, fromPos);
            String typo = text.substring(fromPos, toPos);
            String suffix = text.substring(toPos, end);

            prefix = prefix.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ").stripLeading();
            typo = typo.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ");
            suffix = suffix.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ").stripTrailing();

            sentence = prefix + typo + suffix;
            wordIdx = prefix.length();
            wordEndIdx = wordIdx + typo.length();
        } else {
            // Fallback: 50 chars before, typo, 50 chars after
            int start = Math.max(0, fromPos - 50);
            int end = Math.min(text.length(), toPos + 50);

            String prefix = text.substring(start, fromPos);
            String typo = text.substring(fromPos, toPos);
            String suffix = text.substring(toPos, end);

            prefix = prefix.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ").stripLeading();
            typo = typo.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ");
            suffix = suffix.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ").stripTrailing();

            sentence = prefix + typo + suffix;
            wordIdx = prefix.length();
            wordEndIdx = wordIdx + typo.length();
        }

        // Limit sentence output to 150 characters
        if (sentence.length() > 150) {
            if (wordEndIdx <= 147) {
                return sentence.substring(0, 147).stripTrailing() + "...";
            } else if (sentence.length() - wordIdx <= 147) {
                return "..." + sentence.substring(sentence.length() - 147).stripLeading();
            } else {
                int typoLen = wordEndIdx - wordIdx;
                int remaining = 144 - typoLen;
                int startOffset = wordIdx - remaining / 2;
                startOffset = Math.max(0, startOffset);
                int endOffset = Math.min(sentence.length(), startOffset + 144);

                if (endOffset == sentence.length()) {
                    startOffset = Math.max(0, sentence.length() - 144);
                }

                return "..." + sentence.substring(startOffset, endOffset).trim() + "...";
            }
        }

        return sentence;
    }

    // -------------------------------------------------------------------------
    // Broadcast live progress to SSE clients
    // -------------------------------------------------------------------------
    private void broadcastProgress(Long scanId, AtomicInteger pages, AtomicLong words,
            AtomicInteger issues, String currentUrl) {
        Map<String, Object> progress = new HashMap<>();
        progress.put("pagesScanned", pages.get());
        progress.put("wordsChecked", words.get());
        progress.put("totalIssues", issues.get());
        progress.put("spellingIssues", issues.get());
        progress.put("grammarIssues", 0);
        progress.put("currentUrl", currentUrl);
        liveLogService.sendProgress(scanId, progress);
    }

    // -------------------------------------------------------------------------
    // robots.txt + sitemap helpers
    // -------------------------------------------------------------------------
    private void fetchAndParseRobotsTxt(String rootUrl, String host,
            Set<String> disallowedPrefixes,
            Set<String> sitemaps,
            Long scanId, PrintWriter writer) {
        try {
            URI uri = new URI(rootUrl);
            String robotsUrl = uri.getScheme() + "://" + uri.getAuthority() + "/robots.txt";
            logInfo(scanId, "Fetching robots.txt: " + robotsUrl, writer);
 
            HttpClient client = buildHttpClient();
            long robotsFetchStart = System.nanoTime();
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder()
                            .uri(URI.create(robotsUrl))
                            .header("User-Agent", "Mozilla/5.0 AutoChecker/1.0")
                            .timeout(Duration.ofSeconds(8))
                            .GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            long robotsFetchTime = (System.nanoTime() - robotsFetchStart) / 1_000_000;
            PerformanceTracker.add("robots_txt_fetch", robotsFetchTime);
            System.out.println("[PERF] robots.txt Fetch = " + robotsFetchTime + " ms");
            logInfo(scanId, "[PERF] robots.txt Fetch = " + robotsFetchTime + " ms", writer);
 
            if (resp.statusCode() == 200) {
                boolean userAgentApplies = false;
                for (String line : resp.body().split("\n")) {
                    line = line.trim();
                    if (line.toLowerCase().startsWith("user-agent:")) {
                        String ua = line.substring(11).trim();
                        userAgentApplies = ua.equals("*") || ua.toLowerCase().contains("autochecker");
                    } else if (userAgentApplies && line.toLowerCase().startsWith("disallow:")) {
                        String path = line.substring(9).trim();
                        if (!path.isEmpty())
                            disallowedPrefixes.add(path);
                    } else if (line.toLowerCase().startsWith("sitemap:")) {
                        String sUrl = line.substring(8).trim();
                        if (!sUrl.isEmpty())
                            sitemaps.add(sUrl);
                    }
                }
                logInfo(scanId, "robots.txt parsed. Disallowed paths: " + disallowedPrefixes.size(), writer);
            } else {
                logInfo(scanId, "robots.txt not found (HTTP " + resp.statusCode() + "). Crawling all paths.", writer);
            }
        } catch (Exception e) {
            logInfo(scanId, "Could not fetch robots.txt: " + e.getMessage(), writer);
        }
        // Default sitemap
        if (sitemaps.isEmpty()) {
            try {
                URI uri = new URI(rootUrl);
                sitemaps.add(uri.getScheme() + "://" + uri.getAuthority() + "/sitemap.xml");
            } catch (Exception ignored) {
            }
        }
 
        // Parse sitemaps
        Set<String> sitemapLinks = new HashSet<>();
        for (String sitemapUrl : sitemaps) {
            try {
                logInfo(scanId, "Parsing sitemap: " + sitemapUrl, writer);
                HttpClient client = buildHttpClient();
                long sitemapFetchStart = System.nanoTime();
                HttpResponse<String> resp = client.send(
                        HttpRequest.newBuilder()
                                .uri(URI.create(sitemapUrl))
                                .header("User-Agent", "Mozilla/5.0 AutoChecker/1.0")
                                .timeout(Duration.ofSeconds(8))
                                .GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                long sitemapFetchTime = (System.nanoTime() - sitemapFetchStart) / 1_000_000;
                PerformanceTracker.add("sitemap_fetch", sitemapFetchTime);
                System.out.println("[PERF] Sitemap Fetch = " + sitemapFetchTime + " ms");
                logInfo(scanId, "[PERF] Sitemap Fetch = " + sitemapFetchTime + " ms", writer);
 
                if (resp.statusCode() == 200) {
                    Document doc = Jsoup.parse(resp.body());
                    Elements locs = doc.select("loc");
                    for (Element loc : locs) {
                        String locUrl = loc.text().trim();
                        if (!locUrl.isEmpty())
                            sitemapLinks.add(locUrl);
                    }
                    logInfo(scanId, "Sitemap yielded " + locs.size() + " URLs.", writer);
                }
            } catch (Exception e) {
                logInfo(scanId, "Could not parse sitemap " + sitemapUrl + ": " + e.getMessage(), writer);
            }
        }
        sitemaps.clear();
        sitemaps.addAll(sitemapLinks);
    }

    private HttpClient buildHttpClient() {
        return HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    // -------------------------------------------------------------------------
    // URL filtering
    // -------------------------------------------------------------------------
    private boolean isInternalAndAllowed(String url, String targetHost, Set<String> disallowedPrefixes) {
        if (url == null || url.isBlank())
            return false;
        if (!url.startsWith("http://") && !url.startsWith("https://"))
            return false;
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            if (host == null || !host.equalsIgnoreCase(targetHost))
                return false;

            String path = uri.getPath();
            if (path == null)
                path = "/";

            for (String prefix : disallowedPrefixes) {
                if (prefix.equals("/"))
                    return false;
                if (path.startsWith(prefix))
                    return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Visible text extraction
    // -------------------------------------------------------------------------
    private String extractVisibleText(Document doc) {
        StringBuilder sb = new StringBuilder();
        if (doc.body() != null) {
            extractTextRecursive(doc.body(), sb);
        }
        for (Element input : doc.select("input[placeholder], textarea[placeholder]")) {
            if (isHidden(input))
                continue;
            String ph = input.attr("placeholder").trim();
            if (!ph.isEmpty())
                sb.append(ph).append('\n');
        }
        return sb.toString();
    }

    private void extractTextRecursive(Element element, StringBuilder sb) {
        if (isHidden(element))
            return;

        boolean isBlock = element.isBlock() || element.tagName().equals("br");

        if (isBlock && sb.length() > 0 && sb.charAt(sb.length() - 1) != '\n') {
            sb.append('\n');
        }

        for (org.jsoup.nodes.Node node : element.childNodes()) {
            if (node instanceof org.jsoup.nodes.TextNode) {
                String text = ((org.jsoup.nodes.TextNode) node).text().trim();
                if (!text.isEmpty()) {
                    sb.append(text).append(" ");
                }
            } else if (node instanceof Element) {
                extractTextRecursive((Element) node, sb);
            }
        }

        if (isBlock && sb.length() > 0 && sb.charAt(sb.length() - 1) != '\n') {
            sb.append('\n');
        }
    }

    private boolean isHidden(Element el) {
        Element cur = el;
        while (cur != null) {
            if (cur.hasClass("hidden") || cur.hasClass("d-none"))
                return true;
            String style = cur.attr("style");
            if (style != null) {
                String s = style.toLowerCase().replaceAll("\\s+", "");
                if (s.contains("display:none") || s.contains("visibility:hidden"))
                    return true;
            }
            cur = cur.parent();
        }
        return false;
    }

    private long countWords(String text) {
        if (text == null || text.isBlank())
            return 0;
        return text.split("\\s+").length;
    }

    private String normalizeBrokenWords(String text) {
        if (text == null)
            return null;
        String normalized = text;

        normalized = normalized.replaceAll(
                "(?i)\\bt\\s+(hat|his|heir|he|hese|hem|hose|here|hen|hey|hink|hings|hing|hank|hanks)\\b", "t$1");
        normalized = normalized.replaceAll(
                "(?i)\\br\\s+(eliable|eliability|esponsibility|esponsible|equest|equests|esponse|esponses)\\b", "r$1");
        normalized = normalized.replaceAll(
                "(?i)\\bde\\s+(veloper|velopers|velopment|velopments|velop|velops|velping)\\b", "develop$1");
        normalized = normalized.replaceAll("(?i)\\bper\\s+(formance|formances|form|forms|forming|formed)\\b",
                "perform$1");
        normalized = normalized.replaceAll("(?i)\\bco\\s+(mpany|mpanies|mputer|mputers|de|des|ding|debase|debases)\\b",
                "co$1");
        normalized = normalized.replaceAll("(?i)\\bsoft\\s+(ware|wares)\\b", "software$1");
        normalized = normalized.replaceAll("(?i)\\bweb\\s+(site|sites|page|pages|master|masters)\\b", "web$1");
        normalized = normalized.replaceAll("(?i)\\bcode\\s+(base|bases)\\b", "codebase$1");

        return normalized;
    }

    private static class CrawlTask {
        final String url;
        final int depth;

        CrawlTask(String url, int depth) {
            this.url = url;
            this.depth = depth;
        }
    }

    public void clearInMemoryCaches() {
        scanCancellationTokens.clear();
        scanAuditCollectors.clear();
    }

    public int getInMemoryCacheSize() {
        return scanCancellationTokens.size() + scanAuditCollectors.size();
    }

    public static class AuditReportCollector {
        private final long scanId;
        private final Set<String> ignoredByStatic = java.util.concurrent.ConcurrentHashMap.newKeySet();
        private final Map<String, String> ignoredByDynamic = new ConcurrentHashMap<>();
        private final Set<String> reported = java.util.concurrent.ConcurrentHashMap.newKeySet();

        public AuditReportCollector(long scanId) {
            this.scanId = scanId;
        }

        public void recordStaticIgnore(String word) {
            ignoredByStatic.add(word);
        }

        public void recordDynamicIgnore(String word, String details) {
            ignoredByDynamic.put(word, details);
        }

        public void recordReported(String word) {
            reported.add(word);
        }

        public void writeReport(String directory) {
            try {
                Path dirPath = Paths.get(directory);
                Files.createDirectories(dirPath);
                Path filePath = dirPath.resolve("audit_report_scan_" + scanId + ".txt");

                List<String> lines = new ArrayList<>();
                lines.add("==================================================");
                lines.add("AUDIT REPORT FOR SCAN SESSION #" + scanId);
                lines.add("Generated: " + java.time.LocalDateTime.now());
                lines.add("==================================================");
                lines.add("");
                lines.add("SUMMARY STATS:");
                lines.add("--------------------------------------------------");
                lines.add("Words Ignored by Static Dictionaries: " + ignoredByStatic.size());
                lines.add("Words Ignored by Dynamic Entity Layers: " + ignoredByDynamic.size());
                lines.add("Words Reported as Spelling Mistakes: " + reported.size());
                lines.add("");
                lines.add("==================================================");
                lines.add("1. WORDS IGNORED BY STATIC DICTIONARIES (" + ignoredByStatic.size() + ")");
                lines.add("==================================================");
                ignoredByStatic.stream().sorted().forEach(lines::add);
                lines.add("");
                lines.add("==================================================");
                lines.add("2. WORDS IGNORED BY DYNAMIC ENTITY LAYERS (" + ignoredByDynamic.size() + ")");
                lines.add("==================================================");
                ignoredByDynamic.entrySet().stream()
                        .sorted(Map.Entry.comparingByKey())
                        .forEach(entry -> lines.add(entry.getKey() + " -> " + entry.getValue()));
                lines.add("");
                lines.add("==================================================");
                lines.add("3. WORDS REPORTED AS TYPOS (" + reported.size() + ")");
                lines.add("==================================================");
                reported.stream().sorted().forEach(lines::add);

                Files.write(filePath, lines);
            } catch (Exception e) {
                System.err.println("Failed to write audit report: " + e.getMessage());
            }
        }
    }
}
