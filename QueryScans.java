import java.sql.*;

public class QueryScans {
    public static void main(String[] args) throws Exception {
        Class.forName("org.sqlite.JDBC");
        Connection conn = DriverManager.getConnection("jdbc:sqlite:c:/Users/suppo/Auto-Checker/scanner.db");
        Statement stmt = conn.createStatement();
        
        System.out.println("=== SCANS ===");
        ResultSet rs = stmt.executeQuery("SELECT id, name, url, status, total_issues, pages_scanned FROM scan");
        while (rs.next()) {
            System.out.println("ID: " + rs.getInt("id") + 
                               ", Name: " + rs.getString("name") + 
                               ", URL: " + rs.getString("url") + 
                               ", Status: " + rs.getString("status") + 
                               ", Issues: " + rs.getInt("total_issues") + 
                               ", Pages: " + rs.getInt("pages_scanned"));
        }
        conn.close();
    }
}
