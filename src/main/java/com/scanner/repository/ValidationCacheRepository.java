package com.scanner.repository;

import com.scanner.model.ValidationCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface ValidationCacheRepository extends JpaRepository<ValidationCache, Long> {

    @Query("SELECT vc FROM ValidationCache vc WHERE vc.word = :word AND vc.suggestion = :suggestion")
    Optional<ValidationCache> findByWordAndSuggestion(String word, String suggestion);
}
