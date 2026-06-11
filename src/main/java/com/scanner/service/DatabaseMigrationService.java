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
}
