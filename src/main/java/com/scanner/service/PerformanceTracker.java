package com.scanner.service;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

public class PerformanceTracker {
    private static final ThreadLocal<Map<String, Long>> metrics = ThreadLocal.withInitial(ConcurrentHashMap::new);

    public static void start(String key) {
        metrics.get().put(key + "_start", System.nanoTime());
    }

    public static long stop(String key) {
        Long start = metrics.get().get(key + "_start");
        if (start == null)
            return 0;
        long duration = (System.nanoTime() - start) / 1_000_000; // convert to ms
        metrics.get().put(key, metrics.get().getOrDefault(key, 0L) + duration);
        return duration;
    }

    public static void add(String key, long ms) {
        metrics.get().put(key, metrics.get().getOrDefault(key, 0L) + ms);
    }

    public static long get(String key) {
        return metrics.get().getOrDefault(key, 0L);
    }

    public static void clear() {
        metrics.remove();
    }
}
