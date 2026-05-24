// Second-level target export for Kingdom Adventures map placement analysis.
// This script is intended to run inside Ghidra and exports the second-level
// targets referenced by the selected 02AF subrecord roots.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.Symbol;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ExportMapPlacementSecondLevelTargets extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-second-level-targets";

    private static final TargetSpec[] ROOT_SEEDS = new TargetSpec[] {
        new TargetSpec("ROOT_02AF4FCC", 0x02AF4FCCL),
        new TargetSpec("ROOT_02AF5230", 0x02AF5230L),
        new TargetSpec("ROOT_02AF5284", 0x02AF5284L),
        new TargetSpec("ROOT_02AF7234", 0x02AF7234L),
        new TargetSpec("ROOT_02AF7240", 0x02AF7240L),
        new TargetSpec("ROOT_02AF729C", 0x02AF729CL),
        new TargetSpec("ROOT_02AF7648", 0x02AF7648L),
        new TargetSpec("ROOT_02AF7680", 0x02AF7680L),
        new TargetSpec("ROOT_02AF76CC", 0x02AF76CCL)
    };

    private static final int LAYOUT_SCAN_BYTES = 128;
    private static final int RAW_DUMP_BYTES = 256;
    private static final int POINTER_SCAN_DEPTH = 1;

    @Override
    public void run() throws Exception {
        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File rootsFile = new File(outDir, "second_level_roots.tsv");
        File layoutsFile = new File(outDir, "second_level_layouts.tsv");
        File integerFieldsFile = new File(outDir, "second_level_integer_fields.tsv");
        File byteFlagsFile = new File(outDir, "second_level_byte_flags.tsv");
        File pointerWalkFile = new File(outDir, "second_level_pointer_walk.tsv");
        File similarityFile = new File(outDir, "second_level_similarity.tsv");
        File notesFile = new File(outDir, "second_level_semantic_notes.md");
        File rawIndexFile = new File(outDir, "second_level_raw_memory_index.tsv");

        List<TargetResolution> rootResolutions = resolveRoots(imageBase);
        Set<Address> rootAddresses = collectAddresses(rootResolutions);
        Set<Address> secondLevelTargets = collectPointerTargets(rootAddresses, POINTER_SCAN_DEPTH);

        writeSecondLevelRoots(rootsFile, rootResolutions, rootAddresses, secondLevelTargets);

        List<FieldPattern> patterns = buildFieldPatterns(secondLevelTargets);
        writeSecondLevelLayouts(layoutsFile, patterns);
        writeSecondLevelIntegerFields(integerFieldsFile, patterns);
        writeSecondLevelByteFlags(byteFlagsFile, secondLevelTargets, RAW_DUMP_BYTES);
        writeSecondLevelSimilarity(similarityFile, patterns);

        List<RecordPointer> pointerWalk = collectPointerWalk(secondLevelTargets);
        writeSecondLevelPointerWalk(pointerWalkFile, pointerWalk);

        writeRawMemoryDumps(outDir, rawIndexFile, secondLevelTargets, RAW_DUMP_BYTES);
        writeSecondLevelSemanticNotes(notesFile, rootResolutions, secondLevelTargets);

        println("[DONE] Second-level target export complete. roots=" + rootAddresses.size() + " second_level_targets=" + secondLevelTargets.size());
    }

    private List<TargetResolution> resolveRoots(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : ROOT_SEEDS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address directAddress = toAddr(String.format("0x%08X", spec.rva));
        boolean directInMemory = isAddressInMemory(directAddress);
        Address chosenAddress = null;
        String status;
        String note;

        if (directInMemory) {
            chosenAddress = directAddress;
            status = "confirmed";
            note = "Root seed in memory.";
        }
        else {
            status = "failed";
            note = "Root seed not mapped in memory.";
        }

        println("[TARGET] " + spec.name + " " + addressToString(chosenAddress) + " status=" + status + " note=" + note);
        return new TargetResolution(spec.name, spec.rva, chosenAddress, status, note);
    }

    private Set<Address> collectAddresses(List<TargetResolution> resolutions) {
        Set<Address> addresses = new HashSet<Address>();
        for (TargetResolution res : resolutions) {
            if (res.address != null && isAddressInMemory(res.address)) {
                addresses.add(res.address);
            }
        }
        return addresses;
    }

    private Set<Address> collectPointerTargets(Set<Address> roots, int depth) {
        Set<Address> results = new HashSet<Address>();
        Set<Address> current = new HashSet<Address>(roots);
        for (int i = 0; i < depth; i++) {
            Set<Address> next = new HashSet<Address>();
            for (Address root : current) {
                for (RecordPointer pointer : scanPointers(root)) {
                    Address target = pointer.pointerAddress;
                    if (target != null && isAddressInMemory(target) && !roots.contains(target)) {
                        next.add(target);
                    }
                }
            }
            results.addAll(next);
            current = next;
        }
        return results;
    }

    private List<RecordPointer> collectPointerWalk(Set<Address> addresses) {
        List<RecordPointer> pointers = new ArrayList<RecordPointer>();
        for (Address address : addresses) {
            pointers.addAll(scanPointers(address));
        }
        Collections.sort(pointers, new Comparator<RecordPointer>() {
            @Override
            public int compare(RecordPointer a, RecordPointer b) {
                int cmp = a.recordAddress.compareTo(b.recordAddress);
                if (cmp != 0) return cmp;
                return Integer.compare(a.offset, b.offset);
            }
        });
        return pointers;
    }

    private List<FieldPattern> buildFieldPatterns(Set<Address> addresses) {
        List<FieldPattern> patterns = new ArrayList<FieldPattern>();
        for (Address address : addresses) {
            patterns.add(scanFieldPattern(address, LAYOUT_SCAN_BYTES));
        }
        return patterns;
    }

    private List<RecordPointer> scanPointers(Address address) {
        List<RecordPointer> pointers = new ArrayList<RecordPointer>();
        int pointerSize = currentProgram.getDefaultPointerSize();
        for (int offset = 0; offset < LAYOUT_SCAN_BYTES; offset += pointerSize) {
            Address probe = address.add(offset);
            byte[] raw = new byte[pointerSize];
            try {
                currentProgram.getMemory().getBytes(probe, raw, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                break;
            }
            long value = toUnsignedLong(raw);
            if (value != 0L) {
                Address target = toAddr(String.format("0x%X", value));
                pointers.add(new RecordPointer(address, offset, value, target, classifyPointerTarget(target)));
            }
        }
        return pointers;
    }

    private FieldPattern scanFieldPattern(Address address, int bytes) {
        int pointerSize = currentProgram.getDefaultPointerSize();
        List<FieldInfo> fields = new ArrayList<FieldInfo>();
        for (int index = 0; index < bytes; index += pointerSize) {
            Address probe = address.add(index);
            byte[] raw = new byte[pointerSize];
            try {
                currentProgram.getMemory().getBytes(probe, raw, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                break;
            }
            long value = toUnsignedLong(raw);
            FieldType type;
            Address pointerTarget = null;
            String classification = "";
            if (value == 0L) {
                type = FieldType.ZERO;
            }
            else {
                pointerTarget = toAddr(String.format("0x%X", value));
                if (isAddressInMemory(pointerTarget)) {
                    classification = classifyPointerTarget(pointerTarget);
                    if (!classification.equals("unknown")) {
                        type = FieldType.POINTER;
                    }
                    else {
                        type = FieldType.INTEGER;
                    }
                }
                else {
                    type = FieldType.INTEGER;
                }
            }
            fields.add(new FieldInfo(index, value, type, pointerTarget, classification));
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < fields.size(); i++) {
            if (i > 0) builder.append(",");
            builder.append(fields.get(i).type.token);
        }
        return new FieldPattern(address, fields, builder.toString());
    }

    private void writeSecondLevelRoots(File file, List<TargetResolution> roots, Set<Address> rootAddresses, Set<Address> targets) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_type|root_name|root_address|target_address|symbol|status|note");
        Map<Address, String> symbolCache = new HashMap<Address, String>();
        for (TargetResolution root : roots) {
            symbolCache.put(root.address, getSymbolName(root.address));
        }
        for (Address target : targets) {
            String symbol = getSymbolName(target);
            lines.add("second_level_target|<selected_root>|" + joinAddresses(rootAddresses) + "|" + target + "|" + symbol + "|ok|second-level target behind selected 02AF roots");
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelLayouts(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            lines.add(pattern.address + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelIntegerFields(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|value_hex|value_dec");
        for (FieldPattern pattern : patterns) {
            for (FieldInfo field : pattern.fields) {
                if (field.type == FieldType.INTEGER) {
                    lines.add(pattern.address + "|0x" + Integer.toHexString(field.offset).toUpperCase() + "|0x" + Long.toHexString(field.value).toUpperCase() + "|" + field.value);
                }
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelByteFlags(File file, Set<Address> targets, int bytes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|byte_hex|byte_dec");
        for (Address address : targets) {
            byte[] raw = new byte[bytes];
            try {
                currentProgram.getMemory().getBytes(address, raw, 0, raw.length);
            }
            catch (MemoryAccessException e) {
                continue;
            }
            for (int i = 0; i < raw.length; i++) {
                int value = raw[i] & 0xFF;
                if (value == 0) {
                    continue;
                }
                if (value <= 0x0F || value >= 0xF0) {
                    lines.add(address + "|0x" + Integer.toHexString(i).toUpperCase() + "|0x" + Integer.toHexString(value).toUpperCase() + "|" + value);
                }
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelPointerWalk(File file, List<RecordPointer> pointers) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|offset|pointer_value|pointer_address|classification");
        for (RecordPointer pointer : pointers) {
            lines.add(pointer.recordAddress + "|0x" + Integer.toHexString(pointer.offset).toUpperCase() + "|0x" + Long.toHexString(pointer.pointerValue).toUpperCase() + "|" + pointer.pointerAddress + "|" + pointer.classification);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelSimilarity(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("group_id|pattern|member_count|members");
        Map<String, List<Address>> groups = new HashMap<String, List<Address>>();
        for (FieldPattern pattern : patterns) {
            String key = pattern.pattern;
            if (!groups.containsKey(key)) {
                groups.put(key, new ArrayList<Address>());
            }
            groups.get(key).add(pattern.address);
        }
        int groupId = 1;
        for (Map.Entry<String, List<Address>> entry : groups.entrySet()) {
            List<Address> members = entry.getValue();
            Collections.sort(members);
            lines.add("G" + groupId + "|" + entry.getKey() + "|" + members.size() + "|" + joinAddresses(members));
            groupId++;
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeRawMemoryDumps(File outDir, File indexFile, Set<Address> targets, int bytes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|dump_file|byte_count");
        for (Address address : targets) {
            String name = "raw_" + address.toString().replace(':', '_').replace("0x", "") + ".bin";
            File file = new File(outDir, name);
            byte[] raw = new byte[bytes];
            try {
                currentProgram.getMemory().getBytes(address, raw, 0, raw.length);
            }
            catch (MemoryAccessException e) {
                continue;
            }
            FileOutputStream out = new FileOutputStream(file);
            out.write(raw);
            out.close();
            lines.add(address + "|" + name + "|" + raw.length);
        }
        writeFile(indexFile, join(lines, "\n") + "\n");
    }

    private void writeSecondLevelSemanticNotes(File file, List<TargetResolution> roots, Set<Address> targets) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Second-level Descriptor Semantic Notes\n\n");
        builder.append("This export targets the direct second-level records referenced by the selected 02AF root descriptors.\n\n");
        builder.append("## Selected roots\n\n");
        for (TargetResolution root : roots) {
            builder.append("- ").append(root.name).append(" @ ").append(addressToString(root.address)).append(" status=").append(root.status).append("\n");
        }
        builder.append("\n## Second-level target summary\n\n");
        builder.append("- total unique second-level targets: ").append(targets.size()).append("\n");
        builder.append("- these targets are the first candidate layer expected to contain semantic fields beyond the 02AF pointer vectors.\n");
        builder.append("- the export includes raw memory dumps, pointer-layout metadata, integer-field candidates, and byte-flag candidates for this layer.\n\n");
        builder.append("## Expected findings\n\n");
        builder.append("- small integers and byte flags may appear here if this is the first semantic layer.\n");
        builder.append("- the export should look for orientation/direction values, adjacency masks, connection state bits, footprint/size markers, and buildability indicators.\n");
        builder.append("- if the second-level targets still show a pointer-only layout, the semantic payload is likely one more indirection layer deeper.\n\n");
        builder.append("## Next exact target\n\n");
        builder.append("- inspect the raw memory dumps from these second-level targets first.\n");
        builder.append("- use the integer field and byte flag outputs to pinpoint candidate semantic offsets.\n");
        builder.append("- if the second-level layer still lacks inline semantic values, follow the next pointer chain from the identified non-pointer offsets.\n");
        writeFile(file, builder.toString());
    }

    private String classifyPointerTarget(Address pointerAddress) {
        if (!isAddressInMemory(pointerAddress)) {
            return "unmapped";
        }
        Function function = getFunctionContaining(pointerAddress);
        if (function != null) {
            return "function";
        }
        Data data = currentProgram.getListing().getDataAt(pointerAddress);
        if (data != null) {
            if (data.getValue() instanceof String) {
                return "string";
            }
            return "data";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(pointerAddress);
        if (symbol != null) {
            return "symbol";
        }
        return "unknown";
    }

    private String getSymbolName(Address address) {
        if (address == null) {
            return "<none>";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(address);
        return symbol != null ? symbol.getName() : "<none>";
    }

    private void writeFile(File file, String content) throws IOException {
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write(content);
        writer.close();
    }

    private String join(List<String> items, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(items.get(i));
        }
        return sb.toString();
    }

    private String addressToString(Address address) {
        return address == null ? "<none>" : address.toString();
    }

    private String sanitizeString(String input) {
        if (input == null) {
            return "";
        }
        return input.replace("\n", " ").replace("\r", " ").replace("|", " ");
    }

    private String joinAddresses(Collection<Address> addresses) {
        List<Address> sorted = new ArrayList<Address>(addresses);
        Collections.sort(sorted);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sorted.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(sorted.get(i).toString());
        }
        return sb.toString();
    }

    private long toUnsignedLong(byte[] bytes) {
        long value = 0L;
        for (int i = 0; i < bytes.length; i++) {
            value |= ((long) bytes[i] & 0xFFL) << (8 * i);
        }
        return value;
    }

    private boolean isAddressInMemory(Address addr) {
        return addr != null && currentProgram.getMemory().contains(addr);
    }

    private static class TargetSpec {
        public final String name;
        public final long rva;
        public TargetSpec(String name, long rva) {
            this.name = name;
            this.rva = rva;
        }
    }

    private static class TargetResolution {
        public final String name;
        public final long rva;
        public final Address address;
        public final String status;
        public final String note;
        public TargetResolution(String name, long rva, Address address, String status, String note) {
            this.name = name;
            this.rva = rva;
            this.address = address;
            this.status = status;
            this.note = note;
        }
    }

    private static class RecordPointer {
        public final Address recordAddress;
        public final int offset;
        public final long pointerValue;
        public final Address pointerAddress;
        public final String classification;
        public RecordPointer(Address recordAddress, int offset, long pointerValue, Address pointerAddress, String classification) {
            this.recordAddress = recordAddress;
            this.offset = offset;
            this.pointerValue = pointerValue;
            this.pointerAddress = pointerAddress;
            this.classification = classification;
        }
    }

    private static class FieldPattern {
        public final Address address;
        public final List<FieldInfo> fields;
        public final String pattern;
        public FieldPattern(Address address, List<FieldInfo> fields, String pattern) {
            this.address = address;
            this.fields = fields;
            this.pattern = pattern;
        }
        public int countType(FieldType type) {
            int count = 0;
            for (FieldInfo field : fields) {
                if (field.type == type) {
                    count++;
                }
            }
            return count;
        }
    }

    private static class FieldInfo {
        public final int offset;
        public final long value;
        public final FieldType type;
        public final Address pointerTarget;
        public final String classification;
        public FieldInfo(int offset, long value, FieldType type, Address pointerTarget, String classification) {
            this.offset = offset;
            this.value = value;
            this.type = type;
            this.pointerTarget = pointerTarget;
            this.classification = classification;
        }
    }

    private enum FieldType {
        POINTER("P"),
        INTEGER("I"),
        ZERO("Z"),
        UNKNOWN("U");

        public final String token;
        FieldType(String token) {
            this.token = token;
        }
    }
}
