package com.scanner.repository;

import com.scanner.model.Issue;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface IssueRepository extends JpaRepository<Issue, Long> {
    List<Issue> findByScanId(Long scanId);

    List<Issue> findByScanIdAndRemovedFalse(Long scanId);

    long countByScanIdAndRemovedFalse(Long scanId);

    @Modifying
    @Query("DELETE FROM Issue i WHERE i.scan.id = :scanId")
    void deleteByScanId(Long scanId);

    @Query("SELECT i FROM Issue i WHERE i.scan.id = :scanId AND i.word = :word")
    Optional<Issue> findByScanIdAndWord(Long scanId, String word);

    @org.springframework.data.jpa.repository.Query("SELECT i FROM Issue i WHERE " +
           "(:scanId IS NULL OR i.scan.id = :scanId) AND " +
           "(:removed IS NULL OR i.removed = :removed) AND " +
           "(:detectionSource IS NULL OR LOWER(i.detectionSource) = LOWER(:detectionSource)) AND " +
           "(:search IS NULL OR LOWER(i.word) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(i.pageUrl) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(i.pageTitle) LIKE LOWER(CONCAT('%', :search, '%')))")
    org.springframework.data.domain.Page<Issue> searchIssues(
            @org.springframework.data.repository.query.Param("scanId") Long scanId,
            @org.springframework.data.repository.query.Param("removed") Boolean removed,
            @org.springframework.data.repository.query.Param("detectionSource") String detectionSource,
            @org.springframework.data.repository.query.Param("search") String search,
            org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT i.detectionSource, COUNT(i) FROM Issue i WHERE i.scan.id = :scanId AND i.removed = false GROUP BY i.detectionSource")
    List<Object[]> getIssueBreakdown(@org.springframework.data.repository.query.Param("scanId") Long scanId);

    @org.springframework.data.jpa.repository.Query("SELECT i.word, COUNT(i) as count FROM Issue i WHERE i.removed = false GROUP BY i.word ORDER BY count DESC")
    List<Object[]> getTopRepeatedMisspellings(org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT i.word, COUNT(i) as count FROM Issue i GROUP BY i.word ORDER BY count DESC")
    List<Object[]> getMostFrequentlyFlagged(org.springframework.data.domain.Pageable pageable);
}
