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
}
