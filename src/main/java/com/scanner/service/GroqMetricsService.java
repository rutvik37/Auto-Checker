package com.scanner.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class GroqMetricsService {

    private static final Logger logger = LoggerFactory.getLogger(GroqMetricsService.class);
    private final ObjectMapper objectMapper;
    private final File metricsFile = new File("CustomDictionaries/groq_metrics.json");

    private final AtomicLong totalApiCalls = new AtomicLong(0);
    private final AtomicLong successfulApiCalls = new AtomicLong(0);
    private final AtomicLong failedApiCalls = new AtomicLong(0);
    private final AtomicLong totalPromptTokens = new AtomicLong(0);
    private final AtomicLong totalCompletionTokens = new AtomicLong(0);
    private final AtomicLong totalResponseTimeMs = new AtomicLong(0);
    private final AtomicLong cacheHits = new AtomicLong(0);
    private final AtomicLong cacheMisses = new AtomicLong(0);
    
    private final AtomicLong dailyApiCallsCount = new AtomicLong(0);
    private volatile String lastResetDate = "";

    private final AtomicLong xRemainingRequests = new AtomicLong(-1);
    private final AtomicLong xRemainingTokens = new AtomicLong(-1);

    public GroqMetricsService() {
        this.objectMapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    }

    @PostConstruct
    public void init() {
        File dir = new File("CustomDictionaries");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        
        lastResetDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        
        if (metricsFile.exists()) {
            try {
                Map<String, Object> data = objectMapper.readValue(metricsFile, Map.class);
                totalApiCalls.set(((Number) data.getOrDefault("totalApiCalls", 0)).longValue());
                successfulApiCalls.set(((Number) data.getOrDefault("successfulApiCalls", 0)).longValue());
                failedApiCalls.set(((Number) data.getOrDefault("failedApiCalls", 0)).longValue());
                totalPromptTokens.set(((Number) data.getOrDefault("totalPromptTokens", 0)).longValue());
                totalCompletionTokens.set(((Number) data.getOrDefault("totalCompletionTokens", 0)).longValue());
                totalResponseTimeMs.set(((Number) data.getOrDefault("totalResponseTimeMs", 0)).longValue());
                cacheHits.set(((Number) data.getOrDefault("cacheHits", 0)).longValue());
                cacheMisses.set(((Number) data.getOrDefault("cacheMisses", 0)).longValue());
                
                lastResetDate = (String) data.getOrDefault("lastResetDate", lastResetDate);
                dailyApiCallsCount.set(((Number) data.getOrDefault("dailyApiCallsCount", 0)).longValue());
                
                checkDailyRollover();
            } catch (IOException e) {
                logger.error("Failed to load Groq metrics: {}", e.getMessage());
            }
        } else {
            saveToFile();
        }
    }

    private synchronized void checkDailyRollover() {
        String today = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        if (!today.equals(lastResetDate)) {
            dailyApiCallsCount.set(0);
            lastResetDate = today;
            saveToFile();
        }
    }

    private synchronized void saveToFile() {
        try {
            Map<String, Object> data = new HashMap<>();
            data.put("totalApiCalls", totalApiCalls.get());
            data.put("successfulApiCalls", successfulApiCalls.get());
            data.put("failedApiCalls", failedApiCalls.get());
            data.put("totalPromptTokens", totalPromptTokens.get());
            data.put("totalCompletionTokens", totalCompletionTokens.get());
            data.put("totalResponseTimeMs", totalResponseTimeMs.get());
            data.put("cacheHits", cacheHits.get());
            data.put("cacheMisses", cacheMisses.get());
            data.put("dailyApiCallsCount", dailyApiCallsCount.get());
            data.put("lastResetDate", lastResetDate);
            objectMapper.writeValue(metricsFile, data);
        } catch (IOException e) {
            logger.error("Failed to save Groq metrics: {}", e.getMessage());
        }
    }

    public void recordApiCall(boolean success, long promptTokens, long completionTokens, long responseTimeMs) {
        checkDailyRollover();
        totalApiCalls.incrementAndGet();
        dailyApiCallsCount.incrementAndGet();
        
        if (success) {
            successfulApiCalls.incrementAndGet();
            totalPromptTokens.addAndGet(promptTokens);
            totalCompletionTokens.addAndGet(completionTokens);
        } else {
            failedApiCalls.incrementAndGet();
        }
        
        totalResponseTimeMs.addAndGet(responseTimeMs);
        saveToFile();
    }

    public void incrementCacheHits() {
        cacheHits.incrementAndGet();
        saveToFile();
    }

    public void incrementCacheMisses() {
        cacheMisses.incrementAndGet();
        saveToFile();
    }

    public void updateRateLimits(long remainingRequests, long remainingTokens) {
        if (remainingRequests >= 0) {
            xRemainingRequests.set(remainingRequests);
        }
        if (remainingTokens >= 0) {
            xRemainingTokens.set(remainingTokens);
        }
    }

    public synchronized void resetMetrics() {
        totalApiCalls.set(0);
        successfulApiCalls.set(0);
        failedApiCalls.set(0);
        totalPromptTokens.set(0);
        totalCompletionTokens.set(0);
        totalResponseTimeMs.set(0);
        cacheHits.set(0);
        cacheMisses.set(0);
        dailyApiCallsCount.set(0);
        xRemainingRequests.set(-1);
        xRemainingTokens.set(-1);
        lastResetDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        saveToFile();
    }

    public double calculateEstimatedCost(String model) {
        long prompt = totalPromptTokens.get();
        long completion = totalCompletionTokens.get();
        
        double promptRate = 0.59; // per 1M tokens by default for llama-3.3-70b
        double completionRate = 0.79;
        
        if (model != null) {
            String modelLower = model.toLowerCase();
            if (modelLower.contains("llama-3.1-8b") || modelLower.contains("llama3-8b") || modelLower.contains("llama-3.1-8b-instant")) {
                promptRate = 0.05;
                completionRate = 0.08;
            } else if (modelLower.contains("mixtral-8x7b")) {
                promptRate = 0.24;
                completionRate = 0.24;
            } else if (modelLower.contains("gemma2-9b") || modelLower.contains("gemma-9b")) {
                promptRate = 0.20;
                completionRate = 0.20;
            } else if (modelLower.contains("llama-3.3") || modelLower.contains("llama3-70b")) {
                promptRate = 0.59;
                completionRate = 0.79;
            }
        }
        
        double promptCost = (prompt / 1_000_000.0) * promptRate;
        double completionCost = (completion / 1_000_000.0) * completionRate;
        return promptCost + completionCost;
    }

    public Map<String, Object> getMetricsReport(String model) {
        checkDailyRollover();
        Map<String, Object> report = new HashMap<>();
        report.put("totalApiCalls", totalApiCalls.get());
        report.put("successfulApiCalls", successfulApiCalls.get());
        report.put("failedApiCalls", failedApiCalls.get());
        report.put("totalPromptTokens", totalPromptTokens.get());
        report.put("totalCompletionTokens", totalCompletionTokens.get());
        report.put("totalResponseTimeMs", totalResponseTimeMs.get());
        report.put("cacheHits", cacheHits.get());
        report.put("cacheMisses", cacheMisses.get());
        report.put("dailyApiCallsCount", dailyApiCallsCount.get());
        report.put("xRemainingRequests", xRemainingRequests.get());
        report.put("xRemainingTokens", xRemainingTokens.get());
        
        double avgLatency = 0.0;
        long totalCalls = totalApiCalls.get();
        if (totalCalls > 0) {
            avgLatency = (double) totalResponseTimeMs.get() / totalCalls;
        }
        report.put("averageLatencyMs", avgLatency);
        
        double errorRate = 0.0;
        if (totalCalls > 0) {
            errorRate = ((double) failedApiCalls.get() / totalCalls) * 100;
        }
        report.put("errorRatePercentage", errorRate);
        
        double cacheHitRate = 0.0;
        long totalChecks = cacheHits.get() + cacheMisses.get();
        if (totalChecks > 0) {
            cacheHitRate = ((double) cacheHits.get() / totalChecks) * 100;
        }
        report.put("cacheHitRatePercentage", cacheHitRate);
        report.put("estimatedCostUsd", calculateEstimatedCost(model));
        
        return report;
    }
}
