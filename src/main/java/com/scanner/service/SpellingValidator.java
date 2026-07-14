package com.scanner.service;

import com.scanner.model.ValidationCache;
import com.scanner.repository.ValidationCacheRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.io.PrintWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

@Service
public class SpellingValidator {

    private static final Logger logger = LoggerFactory.getLogger(SpellingValidator.class);

    private final ValidationCacheRepository validationCacheRepository;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final Map<String, String> memoryCache = new java.util.concurrent.ConcurrentHashMap<>();
    
    private final SettingsService settingsService;
    private final Set<String> customDictionaryWords = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final GroqMetricsService groqMetricsService;

    @jakarta.annotation.PostConstruct
    public void init() {
        loadCustomDictionaries();
    }

    public synchronized void loadCustomDictionaries() {
        customDictionaryWords.clear();
        loadDictionaryFile(new java.io.File("CustomDictionaries/global.txt"));
        loadDictionaryFile(new java.io.File("CustomDictionaries/user.txt"));
        logger.info("Loaded {} custom dictionary words.", customDictionaryWords.size());
    }

    private void loadDictionaryFile(java.io.File file) {
        if (!file.exists()) {
            try {
                file.getParentFile().mkdirs();
                java.nio.file.Files.write(file.toPath(), Arrays.asList("# Custom Dictionary - Add one word per line"));
            } catch (java.io.IOException e) {
                logger.error("Failed to create dictionary file {}: {}", file.getName(), e.getMessage());
            }
            return;
        }
        try {
            List<String> lines = java.nio.file.Files.readAllLines(file.toPath());
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                customDictionaryWords.add(line.toLowerCase(Locale.ROOT));
            }
        } catch (java.io.IOException e) {
            logger.error("Failed to read dictionary file {}: {}", file.getName(), e.getMessage());
        }
    }

    public boolean isCustomDictionaryWord(String word) {
        if (word == null) return false;
        return customDictionaryWords.contains(word.trim().toLowerCase(Locale.ROOT));
    }

    public List<String> getDictionaryWords(String type) {
        java.io.File file = new java.io.File("CustomDictionaries/" + type + ".txt");
        List<String> words = new ArrayList<>();
        if (!file.exists()) return words;
        try {
            List<String> lines = java.nio.file.Files.readAllLines(file.toPath());
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                words.add(line);
            }
        } catch (java.io.IOException e) {
            logger.error("Failed to read {} dictionary: {}", type, e.getMessage());
        }
        Collections.sort(words);
        return words;
    }

    public synchronized void addWordToDictionary(String type, String word) throws java.io.IOException {
        if (word == null || word.trim().isEmpty()) return;
        String normalized = word.trim();
        List<String> words = getDictionaryWords(type);
        if (words.stream().anyMatch(w -> w.equalsIgnoreCase(normalized))) {
            return; // Already exists
        }
        
        java.io.File file = new java.io.File("CustomDictionaries/" + type + ".txt");
        List<String> lines = new ArrayList<>();
        if (file.exists()) {
            lines = java.nio.file.Files.readAllLines(file.toPath());
        } else {
            lines.add("# " + type.substring(0, 1).toUpperCase() + type.substring(1) + " Custom Dictionary - Add one word per line");
        }
        lines.add(normalized);
        java.nio.file.Files.write(file.toPath(), lines);
        loadCustomDictionaries();
    }

    public synchronized void removeWordFromDictionary(String type, String word) throws java.io.IOException {
        if (word == null || word.trim().isEmpty()) return;
        String normalized = word.trim();
        java.io.File file = new java.io.File("CustomDictionaries/" + type + ".txt");
        if (!file.exists()) return;
        
        List<String> lines = java.nio.file.Files.readAllLines(file.toPath());
        List<String> newLines = new ArrayList<>();
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.equalsIgnoreCase(normalized) && !trimmed.startsWith("#")) {
                continue; // Remove the word
            }
            newLines.add(line);
        }
        java.nio.file.Files.write(file.toPath(), newLines);
        loadCustomDictionaries();
    }

    @Autowired
    public SpellingValidator(ValidationCacheRepository validationCacheRepository, SettingsService settingsService, GroqMetricsService groqMetricsService) {
        this.validationCacheRepository = validationCacheRepository;
        this.settingsService = settingsService;
        this.groqMetricsService = groqMetricsService;
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public static class SpellingCandidate {
        private final String word;
        private final String suggestion;
        private final String sentence;
        private String decision = "PENDING";
        private String reason = "";

        public SpellingCandidate(String word, String suggestion, String sentence) {
            this.word = word;
            this.suggestion = suggestion;
            this.sentence = sentence;
        }

        public String getWord() {
            return word;
        }

        public String getSuggestion() {
            return suggestion;
        }

        public String getSentence() {
            return sentence;
        }

        public String getDecision() {
            return decision;
        }

        public void setDecision(String decision) {
            this.decision = decision;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public Optional<String> checkCache(String word, String suggestion) {
        if (word == null || suggestion == null) {
            return Optional.empty();
        }
        String w = word.trim().toLowerCase(Locale.ROOT);
        String s = suggestion.trim().toLowerCase(Locale.ROOT);
        String key = w + "|" + s;

        String cachedDecision = memoryCache.get(key);
        if (cachedDecision != null) {
            if ("VALID".equals(cachedDecision) || "TYPO".equals(cachedDecision)) {
                groqMetricsService.incrementCacheHits();
                return Optional.of(cachedDecision);
            }
        }

        try {
            long dbStart = System.nanoTime();
            Optional<ValidationCache> result = validationCacheRepository.findByWordAndSuggestion(w, s);
            long dbTime = (System.nanoTime() - dbStart) / 1_000_000;
            DbPerformanceMonitor.recordQuery(dbTime);
            
            if (result.isPresent()) {
                String decision = result.get().getDecision();
                if ("VALID".equals(decision) || "TYPO".equals(decision)) {
                    memoryCache.put(key, decision);
                    groqMetricsService.incrementCacheHits();
                    return Optional.of(decision);
                }
            }
            return Optional.empty();
        } catch (Exception e) {
            logger.error("Failed to query validation cache for word '{}': {}", word, e.getMessage());
            return Optional.empty();
        }
    }

    public void validateCandidatesBatch(List<SpellingCandidate> candidates, Long scanId, PrintWriter logWriter) {
        if (candidates == null || candidates.isEmpty()) {
            return;
        }

        logInfo(scanId, "Validating " + candidates.size() + " candidates with Groq API...", logWriter);

        // Get API key
        String apiKey = System.getenv("GROQ_API_KEY");
        if (apiKey == null || apiKey.trim().isEmpty()) {
            apiKey = settingsService.getGroqApiKey();
        }

        if (apiKey == null || apiKey.trim().isEmpty()) {
            logger.error("Groq API key is not configured! All validations will be marked as PENDING.");
            logError(scanId, "Groq API Key is missing! Skipping remote validation.", logWriter);
            for (SpellingCandidate c : candidates) {
                c.setDecision("PENDING");
                c.setReason("Groq API Key missing");
                saveToCache(c.getWord(), c.getSuggestion(), "PENDING", "Groq API Key missing");
            }
            return;
        }

        java.util.concurrent.atomic.AtomicInteger requestsSent = new java.util.concurrent.atomic.AtomicInteger(0);
        int currentBatchSize = settingsService.getGroqBatchSize();

        java.util.concurrent.atomic.AtomicLong parallelPrepTime = new java.util.concurrent.atomic.AtomicLong(0);
        java.util.concurrent.atomic.AtomicLong parallelApiTime = new java.util.concurrent.atomic.AtomicLong(0);
        java.util.concurrent.atomic.AtomicLong parallelParseTime = new java.util.concurrent.atomic.AtomicLong(0);

        int numBatches = (candidates.size() + currentBatchSize - 1) / currentBatchSize;
        java.util.concurrent.ExecutorService validationExecutor = java.util.concurrent.Executors.newFixedThreadPool(
                Math.min(10, Math.max(1, numBatches))
        );

        List<java.util.concurrent.CompletableFuture<Void>> futures = new ArrayList<>();

        for (int i = 0; i < candidates.size(); i += currentBatchSize) {
            final List<SpellingCandidate> batch = candidates.subList(i, Math.min(i + currentBatchSize, candidates.size()));
            final String finalApiKey = apiKey;
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                validateWithFallback(batch, finalApiKey, scanId, logWriter, requestsSent, parallelPrepTime, parallelApiTime, parallelParseTime);
            }, validationExecutor));
        }

        try {
            java.util.concurrent.CompletableFuture.allOf(futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();
        } finally {
            validationExecutor.shutdown();
        }

        // Add accumulated parallel timing metrics to the main thread's PerformanceTracker
        PerformanceTracker.add("groq_prep", parallelPrepTime.get());
        PerformanceTracker.add("groq_api", parallelApiTime.get());
        PerformanceTracker.add("groq_parse", parallelParseTime.get());

        int totalCandidates = candidates.size();
        int totalRequestsSent = requestsSent.get();
        int loggedBatchSize = Math.min(currentBatchSize, totalCandidates);
        int candidatesPerRequest = totalRequestsSent > 0
                ? (int) Math.round((double) totalCandidates / totalRequestsSent)
                : 0;

        System.out.println("[GROQ] Total Candidates = " + totalCandidates);
        System.out.println("[GROQ] Batch Size = " + loggedBatchSize);
        System.out.println("[GROQ] Total Requests Sent = " + totalRequestsSent);
        System.out.println("[GROQ] Candidates Per Request = " + candidatesPerRequest);

        logInfo(scanId, "[GROQ] Total Candidates = " + totalCandidates, logWriter);
        logInfo(scanId, "[GROQ] Batch Size = " + loggedBatchSize, logWriter);
        logInfo(scanId, "[GROQ] Total Requests Sent = " + totalRequestsSent, logWriter);
        logInfo(scanId, "[GROQ] Candidates Per Request = " + candidatesPerRequest, logWriter);
    }

    private void validateWithFallback(List<SpellingCandidate> batch, String apiKey, Long scanId, PrintWriter logWriter,
            java.util.concurrent.atomic.AtomicInteger requestsSent,
            java.util.concurrent.atomic.AtomicLong parallelPrepTime,
            java.util.concurrent.atomic.AtomicLong parallelApiTime,
            java.util.concurrent.atomic.AtomicLong parallelParseTime) {
        if (batch.isEmpty()) {
            return;
        }
        try {
            requestsSent.incrementAndGet();
            callGroqForBatch(batch, apiKey, scanId, logWriter, parallelPrepTime, parallelApiTime, parallelParseTime);
        } catch (Exception e) {
            logger.warn("Groq validation failed for batch of size {}: {}. Retrying with fallback...", batch.size(),
                    e.getMessage());
            logError(scanId, "Groq validation failed for batch of size " + batch.size() + ": " + e.getMessage()
                    + ". Retrying with smaller batch...", logWriter);

            if (batch.size() <= 1) {
                // Cannot split further, mark remaining as PENDING
                for (SpellingCandidate c : batch) {
                    c.setDecision("PENDING");
                    c.setReason("Groq call error: " + e.getMessage());
                    saveToCache(c.getWord(), c.getSuggestion(), "PENDING", "Groq call error: " + e.getMessage());
                }
                return;
            }

            int half = Math.max(1, batch.size() / 2);
            List<SpellingCandidate> batch1 = batch.subList(0, half);
            List<SpellingCandidate> batch2 = batch.subList(half, batch.size());

            validateWithFallback(batch1, apiKey, scanId, logWriter, requestsSent, parallelPrepTime, parallelApiTime, parallelParseTime);
            validateWithFallback(batch2, apiKey, scanId, logWriter, requestsSent, parallelPrepTime, parallelApiTime, parallelParseTime);
        }
    }

    private void callGroqForBatch(List<SpellingCandidate> batch, String apiKey, Long scanId, PrintWriter logWriter,
            java.util.concurrent.atomic.AtomicLong parallelPrepTime,
            java.util.concurrent.atomic.AtomicLong parallelApiTime,
            java.util.concurrent.atomic.AtomicLong parallelParseTime)
            throws Exception {
        long prepStart = System.nanoTime();
        // Build payload
        List<Map<String, String>> promptList = new ArrayList<>();
        for (SpellingCandidate c : batch) {
            Map<String, String> entry = new HashMap<>();
            entry.put("word", c.getWord());
            entry.put("suggestion", c.getSuggestion());
            entry.put("sentence", c.getSentence());
            promptList.add(entry);
        }

        String systemPrompt = "You are an expert software QA spelling validation engine.\n" +
                "Your job is to determine whether a candidate word is a genuine spelling mistake.\n\n" +
                "PRE-VALIDATION CONTEXT\n" +
                "The application has already performed preprocessing before sending data to you:\n" +
                "- Duplicate words were removed using case-insensitive normalization.\n" +
                "- URLs were removed.\n" +
                "- Email addresses were removed.\n" +
                "- Numbers were removed.\n" +
                "- Special-character-only values were removed.\n" +
                "- Empty values were removed.\n\n" +
                "Therefore, evaluate only the supplied candidate.\n\n" +
                "RULES\n" +
                "1. Report ONLY genuine spelling mistakes.\n" +
                "2. Do NOT assume a word is wrong simply because it is unfamiliar.\n" +
                "3. Modern software systems contain: Product names, Brand names, Company names, Framework names, Library names, Tool names, API names, Database names, Feature names, Module names, Internal project names, User-defined terminology, Business terminology. These are frequently valid.\n"
                +
                "4. Use sentence context heavily.\n" +
                "5. If a word appears to be a proper noun, person name, company name, product name, framework, library, database, API, module, feature, business term, or domain-specific term, return VALID.\n"
                +
                "6. Ignore capitalization differences.\n" +
                "7. Ignore spacing variations when meaning remains unchanged (e.g., signin vs sign in, signup vs sign up, logout vs log out, userdata vs user data, forgotpassword vs forgot password). These are VALID.\n"
                +
                "8. If a word contains characteristics of a product, module, feature, or business identifier such as CamelCase, PascalCase, or mixed capitalization, treat it as VALID unless there is overwhelming evidence of a spelling error (e.g., XyloCore, UserFlowEngine, DataSphereX, CustomerPortal).\n"
                +
                "9. Only classify TYPO when the word is clearly misspelled, context supports the correction, a clear correction exists, and confidence is at least 95%.\n"
                +
                "10. Never invent corrections.\n" +
                "11. If uncertain, choose VALID.\n\n" +
                "OUTPUT FORMAT\n" +
                "Return a JSON object containing a \"validations\" list, matching this schema:\n" +
                "{\n" +
                "  \"validations\": [\n" +
                "    {\n" +
                "      \"word\": \"word_here\",\n" +
                "      \"decision\": \"TYPO\" or \"VALID\",\n" +
                "      \"reason\": \"explanation_here\"\n" +
                "    }\n" +
                "  ]\n" +
                "}\n" +
                "Do not include any explanation or markdown formatting outside the JSON object.";

        String userPrompt = "Findings to validate:\n" + objectMapper.writeValueAsString(promptList);

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> systemMsg = new HashMap<>();
        systemMsg.put("role", "system");
        systemMsg.put("content", systemPrompt);
        messages.add(systemMsg);

        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", userPrompt);
        messages.add(userMsg);

        Map<String, Object> payload = new HashMap<>();
        payload.put("model", settingsService.getGroqModel());
        payload.put("messages", messages);

        Map<String, Object> responseFormat = new HashMap<>();
        responseFormat.put("type", "json_object");
        payload.put("response_format", responseFormat);

        String requestBody = objectMapper.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                .build();

        long prepEnd = System.nanoTime();
        long prepTime = (prepEnd - prepStart) / 1_000_000;
        parallelPrepTime.addAndGet(prepTime);

        long apiStart = System.nanoTime();
        logInfo(scanId, "Sending " + batch.size() + " candidates to Groq...", logWriter);
        HttpResponse<String> response = null;
        long apiTime = 0;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            long apiEnd = System.nanoTime();
            apiTime = (apiEnd - apiStart) / 1_000_000;
            parallelApiTime.addAndGet(apiTime);
        } catch (Exception e) {
            long apiEnd = System.nanoTime();
            apiTime = (apiEnd - apiStart) / 1_000_000;
            groqMetricsService.recordApiCall(false, 0, 0, apiTime);
            groqMetricsService.incrementCacheMisses();
            throw e;
        }

        long parseStart = System.nanoTime();
        if (response.statusCode() != 200) {
            groqMetricsService.recordApiCall(false, 0, 0, apiTime);
            groqMetricsService.incrementCacheMisses();
            throw new RuntimeException(
                    "Groq API returned HTTP status code " + response.statusCode() + ": " + response.body());
        }

        long promptTokens = 0;
        long completionTokens = 0;
        try {
            JsonNode responseJson = objectMapper.readTree(response.body());
            JsonNode usageNode = responseJson.path("usage");
            if (!usageNode.isMissingNode()) {
                promptTokens = usageNode.path("prompt_tokens").asLong(0);
                completionTokens = usageNode.path("completion_tokens").asLong(0);
            }
        } catch (Exception e) {
            logger.warn("Failed to parse token usage from Groq response: {}", e.getMessage());
        }

        try {
            long remReq = response.headers().firstValueAsLong("x-ratelimit-remaining-requests").orElse(-1);
            long remTok = response.headers().firstValueAsLong("x-ratelimit-remaining-tokens").orElse(-1);
            groqMetricsService.updateRateLimits(remReq, remTok);
        } catch (Exception e) {
            logger.warn("Failed to parse rate limit headers from Groq response: {}", e.getMessage());
        }

        groqMetricsService.recordApiCall(true, promptTokens, completionTokens, apiTime);
        groqMetricsService.incrementCacheMisses();

        JsonNode responseJson = objectMapper.readTree(response.body());
        JsonNode choicesNode = responseJson.path("choices");
        if (choicesNode.isMissingNode() || !choicesNode.isArray() || choicesNode.isEmpty()) {
            throw new RuntimeException("No choices returned from Groq API: " + response.body());
        }

        JsonNode messageNode = choicesNode.get(0).path("message");
        if (messageNode.isMissingNode()) {
            throw new RuntimeException("No message element returned in Groq response: " + response.body());
        }

        JsonNode contentNode = messageNode.path("content");
        if (contentNode.isMissingNode()) {
            throw new RuntimeException("No content element returned in Groq response: " + response.body());
        }

        String rawText = contentNode.asText();
        String cleanedText = cleanJson(rawText);

        JsonNode rootNode = objectMapper.readTree(cleanedText);
        JsonNode decisionArray = rootNode;
        if (rootNode.isObject()) {
            if (rootNode.has("validations") && rootNode.get("validations").isArray()) {
                decisionArray = rootNode.get("validations");
            } else {
                Iterator<Map.Entry<String, JsonNode>> fields = rootNode.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> field = fields.next();
                    if (field.getValue().isArray()) {
                        decisionArray = field.getValue();
                        break;
                    }
                }
            }
        }

        if (!decisionArray.isArray()) {
            throw new RuntimeException(
                    "Groq response is not a valid JSON array or object containing an array: " + cleanedText);
        }

        // Map response to candidates
        Map<String, SpellingCandidate> batchMap = new HashMap<>();
        for (SpellingCandidate c : batch) {
            batchMap.put(c.getWord().toLowerCase(), c);
        }

        for (JsonNode item : decisionArray) {
            String word = item.path("word").asText("").trim();
            String decision = item.path("decision").asText("PENDING").trim().toUpperCase();
            String reason = item.path("reason").asText("").trim();

            if (!"VALID".equals(decision) && !"TYPO".equals(decision)) {
                decision = "PENDING";
            }

            SpellingCandidate candidate = batchMap.get(word.toLowerCase());
            if (candidate != null) {
                candidate.setDecision(decision);
                candidate.setReason(reason);
            }
        }

        // Save decisions to cache (including pending if they were not returned)
        for (SpellingCandidate c : batch) {
            saveToCache(c.getWord(), c.getSuggestion(), c.getDecision(), c.getReason());
        }
        long parseEnd = System.nanoTime();
        long parseTime = (parseEnd - parseStart) / 1_000_000;
        parallelParseTime.addAndGet(parseTime);
    }

    private String cleanJson(String response) {
        if (response == null)
            return "";
        response = response.trim();
        if (response.startsWith("```")) {
            response = response.replaceAll("^```(?:json)?", "");
            response = response.replaceAll("```$", "");
            response = response.trim();
        }
        return response;
    }

    public synchronized void saveToCache(String word, String suggestion, String decision, String reason) {
        if (word == null || suggestion == null) {
            return;
        }
        try {
            String w = word.trim().toLowerCase(Locale.ROOT);
            String s = suggestion.trim().toLowerCase(Locale.ROOT);
            String key = w + "|" + s;

            if ("VALID".equals(decision) || "TYPO".equals(decision)) {
                memoryCache.put(key, decision);
            }

            long queryStart = System.nanoTime();
            Optional<ValidationCache> existing = validationCacheRepository.findByWordAndSuggestion(w, s);
            long queryTime = (System.nanoTime() - queryStart) / 1_000_000;
            DbPerformanceMonitor.recordQuery(queryTime);

            ValidationCache cacheEntry;
            boolean isNew = !existing.isPresent();
            if (existing.isPresent()) {
                cacheEntry = existing.get();
                cacheEntry.setDecision(decision);
                cacheEntry.setReason(reason);
                cacheEntry.setCreatedAt(LocalDateTime.now());
            } else {
                cacheEntry = new ValidationCache(w, s, decision, reason);
            }
            long dbStart = System.nanoTime();
            validationCacheRepository.save(cacheEntry);
            long dbTime = (System.nanoTime() - dbStart) / 1_000_000;

            if (isNew) {
                DbPerformanceMonitor.recordInsert(dbTime);
            } else {
                DbPerformanceMonitor.recordUpdate(dbTime);
            }

            PerformanceTracker.add("db_save", dbTime);
        } catch (Exception e) {
            logger.error("Failed to save validation cache entry for word '{}': {}", word, e.getMessage());
        }
    }

    public void clearMemoryCache() {
        memoryCache.clear();
    }

    public int getMemoryCacheSize() {
        return memoryCache.size();
    }

    private void logInfo(Long scanId, String msg, PrintWriter writer) {
        if (scanId != null) {
            logger.info("Scan {}: {}", scanId, msg);
        }
        if (writer != null) {
            writer.println(LocalDateTime.now() + " [INFO] " + msg);
            writer.flush();
        }
    }

    private void logError(Long scanId, String msg, PrintWriter writer) {
        if (scanId != null) {
            logger.error("Scan {}: [ERROR] {}", scanId, msg);
        }
        if (writer != null) {
            writer.println(LocalDateTime.now() + " [ERROR] " + msg);
            writer.flush();
        }
    }

    public String testGroqWithWord(String word) {
        try {
            String apiKey = System.getenv("GROQ_API_KEY");
            if (apiKey == null || apiKey.trim().isEmpty()) {
                apiKey = settingsService.getGroqApiKey();
            }
            if (apiKey == null || apiKey.trim().isEmpty()) {
                throw new RuntimeException("Groq API Key is missing!");
            }

            Map<String, Object> message = new HashMap<>();
            message.put("role", "user");
            message.put("content", "Validate the word: " + word);

            Map<String, Object> payload = new HashMap<>();
            payload.put("model", settingsService.getGroqModel());
            payload.put("messages", Collections.singletonList(message));

            String requestBody = objectMapper.writeValueAsString(payload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.body();
        } catch (Exception e) {
            throw new RuntimeException("Error during Groq test call: " + e.getMessage(), e);
        }
    }

    public void incrementCacheHits() {
        if (groqMetricsService != null) {
            groqMetricsService.incrementCacheHits();
        }
    }
}
