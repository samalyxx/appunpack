import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipFile;
import com.google.gson.Gson;
import jadx.api.JadxArgs;
import jadx.api.JadxDecompiler;
import jadx.api.impl.NoOpCodeCache;
import jadx.core.dex.nodes.RootNode;
import jadx.core.xmlgen.BinaryXMLParser;
import jadx.core.xmlgen.ResourcesSaver;
import org.w3c.dom.Element;

public class Export {
    public static void main(String[] args) throws Exception {
        if (args.length > 1 && args[0].equals("--split-info")) {
            System.out.println(new Gson().toJson(splitInfo(List.of(args).subList(1, args.length))));
            return;
        }
        if (args.length < 2) throw new IllegalArgumentException("Usage: Export.java APK NEW_DIRECTORY [EXTRA_APK ...]");
        List<java.io.File> inputs = new ArrayList<>();
        for (int index = 0; index < args.length; index++) {
            if (index == 1) continue;
            Path input = Path.of(args[index]).toAbsolutePath().normalize();
            if (!Files.isRegularFile(input)) throw new IllegalArgumentException("APK input must be a regular file.");
            inputs.add(input.toFile());
        }
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        Files.createDirectory(output);

        JadxArgs options = new JadxArgs();
        options.setInputFiles(inputs);
        options.setOutDir(output.toFile());
        options.setThreadsCount(1);
        options.setCodeCache(NoOpCodeCache.INSTANCE);
        // Avoid unbounded path permutations when reconstructing complex finally blocks.
        options.setExtractFinally(false);
        try (JadxDecompiler jadx = new JadxDecompiler(options)) {
            jadx.load();
            jadx.save();
            if (inputs.size() > 1) {
                for (var resource : jadx.getResources()) {
                    var entry = resource.getZipEntry();
                    if (entry == null) continue;
                    int index = inputs.indexOf(entry.getZipFile());
                    if (index < 0) throw new IllegalStateException("Cannot identify source APK for split resource.");
                    Path partOutput = output.resolve("part-resources").resolve("part-%03d".formatted(index));
                    new ResourcesSaver(jadx, partOutput.toFile(), resource).run();
                }
            }
            jadx.printErrorsReport();
            int errors = jadx.getErrorsCount();
            int warnings = jadx.getWarnsCount();
            String status = errors > 0 || warnings > 0 ? "partial" : "completed";
            String stats = """
                {
                  "engine": "jadx",
                  "version": "%s",
                  "status": "%s",
                  "extract_finally": false,
                  "classes": %d,
                  "resources": %d,
                  "errors": %d,
                  "warnings": %d
                }
                """.formatted(JadxDecompiler.getVersion(), status, jadx.getClasses().size(), jadx.getResources().size(), errors, warnings);
            Files.writeString(output.resolve("export.json"), stats, StandardOpenOption.CREATE_NEW);
        }
    }

    @SuppressWarnings("deprecation")
    private static List<Map<String, String>> splitInfo(List<String> paths) throws Exception {
        if (paths.size() > 512) throw new IllegalArgumentException("At most 512 APK parts are supported.");
        JadxArgs options = new JadxArgs();
        BinaryXMLParser decoder = new BinaryXMLParser(new RootNode(options));
        List<Map<String, String>> parts = new ArrayList<>();
        List<String> requiredSplits = new ArrayList<>();
        Set<String> names = new HashSet<>();
        String app = null;
        String version = null;
        int bases = 0;
        for (String name : paths) {
            Path path = Path.of(name).toAbsolutePath().normalize();
            try (ZipFile apk = new ZipFile(path.toFile())) {
                var entry = apk.getEntry("AndroidManifest.xml");
                if (entry == null || entry.isDirectory() || entry.getSize() < 0 || entry.getSize() > 8 * 1024 * 1024)
                    throw new IllegalArgumentException("APK manifest is missing or exceeds 8 MiB: " + path);
                byte[] manifest;
                try (var stream = apk.getInputStream(entry)) { manifest = stream.readNBytes(8 * 1024 * 1024 + 1); }
                if (manifest.length > 8 * 1024 * 1024) throw new IllegalArgumentException("APK manifest exceeds 8 MiB: " + path);
                String xml = decoder.parse(new ByteArrayInputStream(manifest)).getCodeStr();
                Element root = options.getSecurity().parseXml(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))).getDocumentElement();
                if (!root.getTagName().equals("manifest")) throw new IllegalArgumentException("APK XML root must be manifest.");
                String packageName = root.getAttribute("package");
                String split = root.getAttribute("split");
                String config = root.getAttribute("configForSplit");
                if (config.isEmpty()) config = androidAttribute(root, "configForSplit");
                String code = versionNumber(root, "versionCode", false);
                String major = versionNumber(root, "versionCodeMajor", true);
                if (packageName.isBlank() || packageName.length() > 1024 || split.length() > 1024 || config.length() > 1024)
                    throw new IllegalArgumentException("APK package or split identity is missing or oversized.");
                if (app == null) { app = packageName; version = major + ":" + code; }
                if (!app.equals(packageName) || !version.equals(major + ":" + code))
                    throw new IllegalArgumentException("APK parts have different package names or version codes; supply one compatible split set.");
                if (!names.add(split)) throw new IllegalArgumentException("Repeated base/split name; archive may contain alternative variants: " + split);
                if (split.isEmpty()) bases++;
                var dependencies = root.getElementsByTagName("uses-split");
                if (dependencies.getLength() > 512) throw new IllegalArgumentException("APK split dependency budget exceeded.");
                for (int index = 0; index < dependencies.getLength(); index++) {
                    String required = androidAttribute((Element) dependencies.item(index), "name");
                    if (required.isBlank() || required.length() > 1024) throw new IllegalArgumentException("APK uses-split name is missing or oversized.");
                    requiredSplits.add(required);
                }
                Map<String, String> part = new LinkedHashMap<>();
                part.put("path", path.toString());
                part.put("package", packageName);
                part.put("version_code", code);
                part.put("version_code_major", major);
                part.put("split", split);
                part.put("config_for_split", config);
                parts.add(part);
            }
        }
        if (bases != 1) throw new IllegalArgumentException("Supply exactly one base APK and its split APKs.");
        for (String required : requiredSplits) {
            if (!names.contains(required)) throw new IllegalArgumentException("A required feature split is missing: " + required);
        }
        for (Map<String, String> part : parts) {
            String config = part.get("config_for_split");
            if (!config.isEmpty() && !config.equals("base") && !names.contains(config))
                throw new IllegalArgumentException("A configuration split refers to a missing feature split: " + config);
        }
        parts.sort((left, right) -> Boolean.compare(!left.get("split").isEmpty(), !right.get("split").isEmpty()));
        return parts;
    }

    private static String versionNumber(Element manifest, String attribute, boolean optional) {
        String value = androidAttribute(manifest, attribute);
        if (value.isEmpty() && optional) return "0";
        if (!value.matches("(?:[0-9]{1,10}|0x[0-9a-fA-F]{1,8})"))
            throw new IllegalArgumentException("APK " + attribute + " must be a literal unsigned 32-bit integer.");
        BigInteger number = value.startsWith("0x") ? new BigInteger(value.substring(2), 16) : new BigInteger(value);
        if (number.bitLength() > 32) throw new IllegalArgumentException("APK " + attribute + " exceeds 32 bits.");
        return number.toString();
    }

    private static String androidAttribute(Element element, String name) {
        var attributes = element.getAttributes();
        for (int index = 0; index < attributes.getLength(); index++) {
            var attribute = attributes.item(index);
            String qualified = attribute.getNodeName();
            int colon = qualified.indexOf(':');
            if (colon > 0 && qualified.substring(colon + 1).equals(name)
                    && element.getOwnerDocument().getDocumentElement().getAttribute("xmlns:" + qualified.substring(0, colon))
                        .equals("http://schemas.android.com/apk/res/android")) return attribute.getNodeValue();
        }
        return "";
    }
}
