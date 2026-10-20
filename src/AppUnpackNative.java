// Export bounded native pseudocode after headless analysis.
// @category AppUnpack

import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.util.headless.HeadlessScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;

public class AppUnpackNative extends HeadlessScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length != 1 || currentProgram == null) throw new IllegalArgumentException("Expected an output directory and imported program.");
        Path output = Path.of(args[0]);
        JsonObject report = new JsonObject();
        JsonArray functions = new JsonArray();
        Gson gson = new Gson();
        report.addProperty("format", "appunpack-native-v1");
        report.addProperty("language", currentProgram.getLanguageID().toString());
        report.addProperty("compiler", currentProgram.getCompilerSpec().getCompilerSpecID().toString());
        report.addProperty("imageBase", currentProgram.getImageBase().toString());
        report.addProperty("detectedFunctions", currentProgram.getFunctionManager().getFunctionCount());
        boolean partial = analysisTimeoutOccurred() || currentProgram.getFunctionManager().getFunctionCount() == 0;
        int decompiled = 0, failed = 0, bytes = 128, jsonBytes = 0;
        long deadline = System.nanoTime() + 180_000_000_000L;
        DecompInterface decompiler = new DecompInterface();
        decompiler.toggleSyntaxTree(false);
        try (BufferedWriter code = Files.newBufferedWriter(output.resolve("pseudocode.c"), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW)) {
            code.write("/* Reconstructed Ghidra pseudocode; not original source or a buildable C project. */\n");
            if (!decompiler.openProgram(currentProgram)) throw new IllegalStateException("Ghidra decompiler could not open the imported program.");
            FunctionIterator iterator = currentProgram.getFunctionManager().getFunctions(true);
            while (iterator.hasNext()) {
                monitor.checkCancelled();
                if (functions.size() >= 5000 || System.nanoTime() >= deadline || bytes >= 16 * 1024 * 1024) { partial = true; break; }
                Function function = iterator.next();
                if (function.isExternal()) continue;
                JsonObject entry = new JsonObject();
                String name = function.getName();
                if (name.length() > 1024) partial = true;
                entry.addProperty("name", name.substring(0, Math.min(name.length(), 1024)));
                entry.addProperty("address", function.getEntryPoint().toString());
                String block = null;
                DecompileResults result = decompiler.decompileFunction(function, 15, monitor);
                if (result.decompileCompleted() && result.getDecompiledFunction() != null) {
                    String text = result.getDecompiledFunction().getC();
                    String candidate = "\n/* Address: " + function.getEntryPoint() + " */\n" + text;
                    int length = candidate.getBytes(StandardCharsets.UTF_8).length;
                    if (length > 1024 * 1024 || bytes + length > 16 * 1024 * 1024) {
                        entry.addProperty("status", "output_limit");
                        partial = true;
                    } else {
                        block = candidate;
                        entry.addProperty("status", "decompiled");
                    }
                } else {
                    entry.addProperty("status", "failed");
                    String error = result.getErrorMessage();
                    entry.addProperty("error", error == null ? "Unknown decompiler failure" : error.substring(0, Math.min(error.length(), 1024)));
                    partial = true;
                }
                int entryBytes = gson.toJson(entry).getBytes(StandardCharsets.UTF_8).length + 1;
                if (jsonBytes + entryBytes > 16 * 1024 * 1024 - 4096) { partial = true; break; }
                functions.add(entry);
                jsonBytes += entryBytes;
                if (block != null) {
                    code.write(block);
                    bytes += block.getBytes(StandardCharsets.UTF_8).length;
                    decompiled++;
                } else failed++;
            }
        } finally { decompiler.dispose(); }
        report.add("functions", functions);
        report.addProperty("decompiled", decompiled);
        report.addProperty("failed", failed);
        report.addProperty("partial", partial);
        try (BufferedWriter json = Files.newBufferedWriter(output.resolve("functions.json"), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW)) {
            gson.toJson(report, json);
        }
        println("AppUnpack native export: " + decompiled + " decompiled, " + failed + " failed; partial=" + partial);
    }
}
