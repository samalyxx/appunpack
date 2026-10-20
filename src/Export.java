import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import jadx.api.JadxArgs;
import jadx.api.JadxDecompiler;
import jadx.api.impl.NoOpCodeCache;

public class Export {
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Usage: Export.java APK NEW_DIRECTORY");
        Path input = Path.of(args[0]).toAbsolutePath().normalize();
        if (!Files.isRegularFile(input)) throw new IllegalArgumentException("APK input must be a regular file.");
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        Files.createDirectory(output);

        JadxArgs options = new JadxArgs();
        options.setInputFile(input.toFile());
        options.setOutDir(output.toFile());
        options.setThreadsCount(1);
        options.setCodeCache(NoOpCodeCache.INSTANCE);
        try (JadxDecompiler jadx = new JadxDecompiler(options)) {
            jadx.load();
            jadx.save();
            jadx.printErrorsReport();
            int errors = jadx.getErrorsCount();
            int warnings = jadx.getWarnsCount();
            String status = errors > 0 || warnings > 0 ? "partial" : "completed";
            String stats = """
                {
                  "engine": "jadx",
                  "version": "%s",
                  "status": "%s",
                  "classes": %d,
                  "resources": %d,
                  "errors": %d,
                  "warnings": %d
                }
                """.formatted(JadxDecompiler.getVersion(), status, jadx.getClasses().size(), jadx.getResources().size(), errors, warnings);
            Files.writeString(output.resolve("export.json"), stats, StandardOpenOption.CREATE_NEW);
        }
    }
}
