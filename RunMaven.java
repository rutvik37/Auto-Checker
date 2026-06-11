public class RunMaven {
    public static void main(String[] args) {
        try {
            System.setProperty("maven.home", "C:\\Users\\suppo\\Auto-Checker\\.tools\\maven");
            System.setProperty("maven.multiModuleProjectDirectory", "C:\\Users\\suppo\\Auto-Checker");
            System.setProperty("maven.repo.local", "C:\\Users\\suppo\\Auto-Checker\\.m2\\repository");
            System.setProperty("java.io.tmpdir", "C:\\Users\\suppo\\Auto-Checker\\tmp");
            System.setProperty("user.home", "C:\\Users\\suppo\\Auto-Checker");
            
            org.codehaus.plexus.classworlds.ClassWorld world = new org.codehaus.plexus.classworlds.ClassWorld("plexus.core", Thread.currentThread().getContextClassLoader());
            org.apache.maven.cli.MavenCli cli = new org.apache.maven.cli.MavenCli(world);
            int result = cli.doMain(args, world);
            System.out.println("Result: " + result);
        } catch (Throwable t) {
            t.printStackTrace(System.out);
        }
    }
}
