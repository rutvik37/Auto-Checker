package com.scanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class LiveLogService {

    private static final Logger logger = LoggerFactory.getLogger(LiveLogService.class);

    // Map of scanId -> list of active emitters
    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter register(Long scanId) {
        SseEmitter emitter = new SseEmitter(1800000L); // 30 minute timeout
        List<SseEmitter> scanEmitters = emitters.computeIfAbsent(scanId, k -> new CopyOnWriteArrayList<>());
        scanEmitters.add(emitter);

        emitter.onCompletion(() -> scanEmitters.remove(emitter));
        emitter.onTimeout(() -> scanEmitters.remove(emitter));
        emitter.onError(e -> scanEmitters.remove(emitter));

        return emitter;
    }

    public void log(Long scanId, String message) {
        logger.info("[Scan {}] {}", scanId, message);
        send(scanId, "log", message);
    }

    public void sendProgress(Long scanId, Map<String, Object> progressData) {
        send(scanId, "progress", progressData);
    }

    private void send(Long scanId, String eventName, Object data) {
        List<SseEmitter> scanEmitters = emitters.get(scanId);
        if (scanEmitters == null || scanEmitters.isEmpty()) {
            return;
        }

        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : scanEmitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventName)
                        .data(data));
            } catch (IOException e) {
                deadEmitters.add(emitter);
            }
        }
        scanEmitters.removeAll(deadEmitters);
    }

    public void close(Long scanId) {
        List<SseEmitter> scanEmitters = emitters.remove(scanId);
        if (scanEmitters != null) {
            for (SseEmitter emitter : scanEmitters) {
                try {
                    emitter.complete();
                } catch (Exception ignored) {}
            }
        }
    }

    public void clearInMemoryCaches() {
        emitters.clear();
    }

    public int getInMemoryCacheSize() {
        return emitters.size();
    }
}
