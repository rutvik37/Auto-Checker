package com.scanner.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Runs on application startup to apply any missing SQLite schema changes
 * that Hibernate's ddl-auto=update cannot handle for SQLite.
 *
 * Specifically ensures the `removed` column exists on the `issues` table.
 * Safe to run multiple times — checks before applying.
 */
@Component
public class DatabaseMigrationService implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseMigrationService.class);

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        ensureRemovedColumnExists();
        consolidateDuplicateWordIssues();
    }

    private void ensureRemovedColumnExists() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            // Check if 'removed' column already exists in the issues table
            boolean columnExists = false;
            try (ResultSet rs = stmt.executeQuery("PRAGMA table_info(issues)")) {
                while (rs.next()) {
                    String colName = rs.getString("name");
                    if ("removed".equalsIgnoreCase(colName)) {
                        columnExists = true;
                        break;
                    }
                }
            }

            if (!columnExists) {
                logger.info("[Migration] 'removed' column not found in issues table. Adding it now...");
                stmt.execute("ALTER TABLE issues ADD COLUMN removed INTEGER NOT NULL DEFAULT 0");
                logger.info("[Migration] Successfully added 'removed' column to issues table.");
            } else {
                logger.info("[Migration] 'removed' column already exists in issues table. Skipping.");
            }

        } catch (Exception e) {
            logger.error("[Migration] Failed to apply schema migration for 'removed' column: {}", e.getMessage(), e);
        }
    }

    private void consolidateDuplicateWordIssues() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            // Find all unique LOWER(word) values that have count > 1 in issues table
            java.util.List<String> duplicateWords = new java.util.ArrayList<>();
            try (ResultSet rs = stmt.executeQuery("SELECT LOWER(word) FROM issues GROUP BY LOWER(word) HAVING COUNT(*) > 1")) {
                while (rs.next()) {
                    duplicateWords.add(rs.getString(1));
                }
            }

            if (!duplicateWords.isEmpty()) {
                logger.info("[Migration] Found {} misspelled words with duplicate issue entries. Consolidating into 1 entry per word...", duplicateWords.size());
                int consolidatedCount = 0;

                for (String wordLower : duplicateWords) {
                    try (java.sql.PreparedStatement selectStmt = conn.prepareStatement(
                            "SELECT id, page_url, page_title, full_sentence, suggested_text, timestamp FROM issues WHERE LOWER(word) = ? ORDER BY id DESC")) {
                        selectStmt.setString(1, wordLower);
                        try (ResultSet rs = selectStmt.executeQuery()) {
                            Long primaryId = null;
                            java.util.Set<String> allUrls = new java.util.LinkedHashSet<>();
                            String latestTitle = null;
                            String maxTimestamp = null;
                            java.util.List<Long> deleteIds = new java.util.ArrayList<>();

                            while (rs.next()) {
                                long id = rs.getLong("id");
                                String url = rs.getString("page_url");
                                String title = rs.getString("page_title");
                                String ts = rs.getString("timestamp");

                                if (primaryId == null) {
                                    primaryId = id; // Keep the latest record
                                    latestTitle = title;
                                    maxTimestamp = ts;
                                } else {
                                    deleteIds.add(id);
                                }

                                if (url != null && !url.trim().isEmpty()) {
                                    for (String u : url.split(",\\s*")) {
                                        if (!u.trim().isEmpty()) allUrls.add(u.trim());
                                    }
                                }
                            }

                            if (primaryId != null) {
                                String mergedUrls = String.join(", ", allUrls);
                                try (java.sql.PreparedStatement updateStmt = conn.prepareStatement(
                                        "UPDATE issues SET page_url = ?, timestamp = COALESCE(?, timestamp) WHERE id = ?")) {
                                    updateStmt.setString(1, mergedUrls);
                                    updateStmt.setString(2, maxTimestamp);
                                    updateStmt.setLong(3, primaryId);
                                    updateStmt.executeUpdate();
                                }

                                if (!deleteIds.isEmpty()) {
                                    StringBuilder deleteSql = new StringBuilder("DELETE FROM issues WHERE id IN (");
                                    for (int i = 0; i < deleteIds.size(); i++) {
                                        if (i > 0) deleteSql.append(",");
                                        deleteSql.append(deleteIds.get(i));
                                    }
                                    deleteSql.append(")");
                                    try (Statement delStmt = conn.createStatement()) {
                                        delStmt.executeUpdate(deleteSql.toString());
                                    }
                                }
                                consolidatedCount++;
                            }
                        }
                    }
                }
                logger.info("[Migration] Successfully consolidated {} duplicate misspelled word entries into unique records.", consolidatedCount);
            } else {
                logger.info("[Migration] All spelling issue entries are already unique per word.");
            }
        } catch (Exception e) {
            logger.error("[Migration] Failed to consolidate duplicate word issues: {}", e.getMessage(), e);
        }
    }
}
