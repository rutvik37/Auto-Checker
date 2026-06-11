package com.scanner.service;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.ConcurrentHashMap;

public class DbPerformanceMonitor {
    private static final ConcurrentHashMap<Long, ScanDbMetrics> scanMetricsMap = new ConcurrentHashMap<>();
    private static final ThreadLocal<Long> threadScanId = new ThreadLocal<>();

    public static class ScanDbMetrics {
        public final AtomicInteger queries = new AtomicInteger(0);
        public final AtomicInteger inserts = new AtomicInteger(0);
        public final AtomicInteger updates = new AtomicInteger(0);
        public final AtomicInteger batchInserts = new AtomicInteger(0);
        public final AtomicInteger batchUpdates = new AtomicInteger(0);
        public final AtomicLong dbTimeMs = new AtomicLong(0);
    }

    public static void registerScan(Long scanId) {
        if (scanId != null) {
            scanMetricsMap.put(scanId, new ScanDbMetrics());
            threadScanId.set(scanId);
        }
    }

    public static void associateCurrentThread(Long scanId) {
        if (scanId != null) {
            threadScanId.set(scanId);
        }
    }

    public static void unregisterScan(Long scanId) {
        if (scanId != null) {
            scanMetricsMap.remove(scanId);
            threadScanId.remove();
        }
    }

    public static ScanDbMetrics getMetrics(Long scanId) {
        if (scanId == null) {
            Long currentScanId = threadScanId.get();
            if (currentScanId != null) {
                return scanMetricsMap.get(currentScanId);
            }
            return null;
        }
        return scanMetricsMap.get(scanId);
    }

    public static ScanDbMetrics getMetrics() {
        return getMetrics(null);
    }

    public static void recordQuery(long timeMs) {
        ScanDbMetrics m = getMetrics();
        if (m != null) {
            m.queries.incrementAndGet();
            m.dbTimeMs.addAndGet(timeMs);
        }
    }

    public static void recordInsert(long timeMs) {
        ScanDbMetrics m = getMetrics();
        if (m != null) {
            m.inserts.incrementAndGet();
            m.dbTimeMs.addAndGet(timeMs);
        }
    }

    public static void recordUpdate(long timeMs) {
        ScanDbMetrics m = getMetrics();
        if (m != null) {
            m.updates.incrementAndGet();
            m.dbTimeMs.addAndGet(timeMs);
        }
    }

    public static void recordBatchInsert(int count, long timeMs) {
        ScanDbMetrics m = getMetrics();
        if (m != null) {
            m.batchInserts.addAndGet(count);
            m.dbTimeMs.addAndGet(timeMs);
        }
    }

    public static void recordBatchUpdate(int count, long timeMs) {
        ScanDbMetrics m = getMetrics();
        if (m != null) {
            m.batchUpdates.addAndGet(count);
            m.dbTimeMs.addAndGet(timeMs);
        }
    }
}
