package com.scanner.repository;

import com.scanner.model.ValidationCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.List;

@Repository
public interface ValidationCacheRepository extends JpaRepository<ValidationCache, Long> {

    @Query("SELECT vc FROM ValidationCache vc WHERE vc.word = :word AND vc.suggestion = :suggestion")
    Optional<ValidationCache> findByWordAndSuggestion(String word, String suggestion);

    @org.springframework.data.jpa.repository.Query("SELECT vc FROM ValidationCache vc WHERE " +
           "(:decision IS NULL OR vc.decision = :decision) AND " +
           "(:search IS NULL OR LOWER(vc.word) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(vc.suggestion) LIKE LOWER(CONCAT('%', :search, '%')) OR LOWER(vc.reason) LIKE LOWER(CONCAT('%', :search, '%')))")
    org.springframework.data.domain.Page<ValidationCache> searchCache(
            @org.springframework.data.repository.query.Param("decision") String decision,
            @org.springframework.data.repository.query.Param("search") String search,
            org.springframework.data.domain.Pageable pageable);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT vc.word) FROM ValidationCache vc")
    long countUniqueWords();

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(vc) FROM ValidationCache vc WHERE vc.decision = :decision")
    long countByDecision(@org.springframework.data.repository.query.Param("decision") String decision);

    @org.springframework.data.jpa.repository.Query(value = "SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count FROM validation_cache GROUP BY date ORDER BY date DESC LIMIT 30", nativeQuery = true)
    List<Object[]> getCacheGrowth();
}
