import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class RunMaven {
    public static void main(String[] args) {
        try {
            String projectRoot = "C:\\Users\\suppo\\Auto-Checker";
            String mavenHome = projectRoot + "\\.tools\\maven";
            String javaHome = projectRoot + "\\.tools\\jdk21";
            String localRepo = projectRoot + "\\.m2\\repository";

            // Check if system Maven 'mvn' is available
            boolean useSystemMaven = false;
            try {
                ProcessBuilder checkPb = new ProcessBuilder("cmd.exe", "/c", "where mvn");
                Process check = checkPb.start();
                if (check.waitFor() == 0) {
                    useSystemMaven = true;
                }
            } catch (Exception e) {
                // System mvn not found
            }

            List<String> command = new ArrayList<>();
            if (useSystemMaven) {
                System.out.println("Detected system Maven. Using system Maven for execution...");
                command.add("mvn");
            } else {
                System.out.println("System Maven not found. Using bundled Maven...");
                command.add(mavenHome + "\\bin\\mvn.cmd");
            }

            command.add("-Dmaven.repo.local=" + localRepo);
            if (args != null && args.length > 0) {
                command.addAll(Arrays.asList(args));
            } else {
                command.add("clean");
                command.add("compile");
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(new File(projectRoot));
            
            // Only configure environment variables if using bundled Maven
            if (!useSystemMaven) {
                Map<String, String> env = pb.environment();
                env.put("JAVA_HOME", javaHome);
                String currentPath = env.getOrDefault("PATH", "");
                env.put("PATH", javaHome + "\\bin;" + mavenHome + "\\bin;" + currentPath);
            }

            pb.inheritIO();
            Process process = pb.start();
            int exitCode = process.waitFor();
            System.out.println("Result: " + exitCode);
        } catch (Throwable t) {
            t.printStackTrace(System.out);
        }
    }
}

