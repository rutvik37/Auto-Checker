package com.scanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import com.scanner.repository.ValidationCacheRepository;
import java.io.File;

@Component
@Order(1)
public class CacheResetRunner implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(CacheResetRunner.class);

    private final ValidationCacheRepository validationCacheRepository;
    private final CrawlScanService crawlScanService;
    private final LiveLogService liveLogService;

    @Autowired
    public CacheResetRunner(ValidationCacheRepository validationCacheRepository,
                            CrawlScanService crawlScanService,
                            LiveLogService liveLogService) {
        this.validationCacheRepository = validationCacheRepository;
        this.crawlScanService = crawlScanService;
        this.liveLogService = liveLogService;
    }

    @Override
    public void run(ApplicationArguments args) {
        System.out.println("[CACHE] Cache reset started");
        
        long dbEntriesCount = 0;
        int inMemoryEntriesCount = 0;
        int tmpRemovedCount = 0;
        
        // 1. Clear Database Cache
        try {
            dbEntriesCount = validationCacheRepository.count();
            validationCacheRepository.deleteAll();
            System.out.println("[CACHE] Cache type found: Local Database Cache");
            System.out.println("[CACHE] Cache location: validation_cache table in scanner.db");
            System.out.println("[CACHE] Number of entries removed: " + dbEntriesCount);
            System.out.println("[CACHE] Cache reset status: SUCCESS");
        } catch (Exception e) {
            System.err.println("[CACHE] Failed to clear local database cache: " + e.getMessage());
            System.out.println("[CACHE] Cache reset status: FAILED");
        }

        // 2. Clear In-Memory Caches
        try {
            inMemoryEntriesCount = crawlScanService.getInMemoryCacheSize() + liveLogService.getInMemoryCacheSize();
            crawlScanService.clearInMemoryCaches();
            liveLogService.clearInMemoryCaches();
            System.out.println("[CACHE] Cache type found: In-Memory Concurrent Cache Maps");
            System.out.println("[CACHE] Cache location: CrawlScanService and LiveLogService active maps");
            System.out.println("[CACHE] Number of entries removed: " + inMemoryEntriesCount);
            System.out.println("[CACHE] Cache reset status: SUCCESS");
        } catch (Exception e) {
            System.err.println("[CACHE] Failed to clear in-memory caches: " + e.getMessage());
            System.out.println("[CACHE] Cache reset status: FAILED");
        }

        // 3. Clear Disk-Based Temporary Storage
        try {
            File tmpDir = new File("C:\\Users\\suppo\\Auto-Checker\\tmp");
            if (tmpDir.exists() && tmpDir.isDirectory()) {
                File[] files = tmpDir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        if (f.isFile() && !f.getName().equals(".keep")) {
                            if (f.delete()) {
                                tmpRemovedCount++;
                            }
                        }
                    }
                }
            }
            System.out.println("[CACHE] Cache type found: Disk-Based Temporary Storage");
            System.out.println("[CACHE] Cache location: C:\\Users\\suppo\\Auto-Checker\\tmp");
            System.out.println("[CACHE] Number of entries removed: " + tmpRemovedCount);
            System.out.println("[CACHE] Cache reset status: SUCCESS");
        } catch (Exception e) {
            System.err.println("[CACHE] Failed to clear disk-based temporary storage: " + e.getMessage());
            System.out.println("[CACHE] Cache reset status: FAILED");
        }

        long totalRemoved = dbEntriesCount + inMemoryEntriesCount + tmpRemovedCount;
        System.out.println("[CACHE] Cache entries removed: " + totalRemoved);
        System.out.println("[CACHE] Cache reset completed");
    }
}
