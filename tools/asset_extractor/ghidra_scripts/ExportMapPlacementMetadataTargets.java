// Metadata target descriptor export for Kingdom Adventures map placement analysis.
// This script is intended to run inside Ghidra and exports the descriptor records
// referenced by the important 0x8015/0x2015/0x0015 metadata/state codes.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
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

public class ExportMapPlacementMetadataTargets extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-metadata-targets";

    private static final TargetSpec[] METADATA_TARGETS = new TargetSpec[] {
        new TargetSpec("METADATA_TARGET_02B5FF64", 0x02B5FF64L),
        new TargetSpec("METADATA_TARGET_02B5F224", 0x02B5F224L),
        new TargetSpec("METADATA_TARGET_02B59E84", 0x02B59E84L),
        new TargetSpec("METADATA_TARGET_02B59EA4", 0x02B59EA4L),
        new TargetSpec("METADATA_TARGET_02B59EE4", 0x02B59EE4L),
        new TargetSpec("METADATA_TARGET_02B5F204", 0x02B5F204L),
        new TargetSpec("METADATA_TARGET_02B5F294", 0x02B5F294L),
        new TargetSpec("METADATA_TARGET_02B5F2D4", 0x02B5F2D4L),
        new TargetSpec("METADATA_TARGET_02B5FF84", 0x02B5FF84L),
        new TargetSpec("METADATA_TARGET_02B5FF94", 0x02B5FF94L)
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

        File targetsFile = new File(outDir, "metadata_targets.tsv");
        File layoutsFile = new File(outDir, "metadata_target_layouts.tsv");
        File integerFieldsFile = new File(outDir, "metadata_target_integer_fields.tsv");
        File byteFlagsFile = new File(outDir, "metadata_target_byte_flags.tsv");
        File pointerWalkFile = new File(outDir, "metadata_target_pointer_walk.tsv");
        File similarityFile = new File(outDir, "metadata_target_similarity.tsv");
        File xrefsFile = new File(outDir, "metadata_target_xrefs.tsv");
        File notesFile = new File(outDir, "metadata_target_semantic_notes.md");
        File rawIndexFile = new File(outDir, "metadata_target_raw_memory_index.tsv");

        List<TargetResolution> targetResolutions = resolveTargets(imageBase);
        Set<Address> targetAddresses = collectAddresses(targetResolutions);

        writeMetadataTargets(targetsFile, targetResolutions);

        List<FieldPattern> patterns = buildFieldPatterns(targetAddresses);
        writeLayouts(layoutsFile, patterns);
        writeIntegerFields(integerFieldsFile, patterns);
        writeByteFlags(byteFlagsFile, targetAddresses, RAW_DUMP_BYTES);
        writeSimilarity(similarityFile, patterns);

        List<RecordPointer> pointerWalk = collectPointerWalk(targetAddresses);
        writePointerWalk(pointerWalkFile, pointerWalk);

        writeXrefs(xrefsFile, targetAddresses);
        writeRawMemoryDumps(outDir, rawIndexFile, targetAddresses, RAW_DUMP_BYTES);
        writeNotes(notesFile, targetResolutions);

        println("[DONE] Metadata target export complete. targets=" + targetAddresses.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : METADATA_TARGETS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address address = toAddr(String.format("0x%08X", spec.rva));
        boolean inMemory = isAddressInMemory(address);
        String status = inMemory ? "confirmed" : "failed";
        String note = inMemory ? "Mapped metadata descriptor target." : "Target address not mapped.";
        println("[TARGET] " + spec.name + " " + addressToString(address) + " status=" + status);
        return new TargetResolution(spec.name, spec.rva, address, status, note);
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

    private void writeMetadataTargets(File file, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|target_name|symbol|status|note");
        for (TargetResolution res : resolutions) {
            lines.add(addressToString(res.address) + "|" + res.name + "|" + getSymbolName(res.address) + "|" + res.status + "|" + sanitizeString(res.note));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeLayouts(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            lines.add(pattern.address + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeIntegerFields(File file, List<FieldPattern> patterns) throws IOException {
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

    private void writeByteFlags(File file, Set<Address> targets, int bytes) throws IOException {
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
                if (value == 0) continue;
                if (value <= 0x0F || value >= 0xF0) {
                    lines.add(address + "|0x" + Integer.toHexString(i).toUpperCase() + "|0x" + Integer.toHexString(value).toUpperCase() + "|" + value);
                }
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writePointerWalk(File file, List<RecordPointer> pointers) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|offset|pointer_value|pointer_address|classification");
        for (RecordPointer pointer : pointers) {
            lines.add(pointer.recordAddress + "|0x" + Integer.toHexString(pointer.offset).toUpperCase() + "|0x" + Long.toHexString(pointer.pointerValue).toUpperCase() + "|" + pointer.pointerAddress + "|" + pointer.classification);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeSimilarity(File file, List<FieldPattern> patterns) throws IOException {
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

    private void writeXrefs(File file, Set<Address> targets) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_address|from_address|reference_type|from_symbol|target_symbol");
        for (Address target : targets) {
            ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(target);
            while (refs.hasNext()) {
                Reference ref = refs.next();
                Address from = ref.getFromAddress();
                lines.add(target + "|" + from + "|" + ref.getReferenceType().getName() + "|" + getSymbolName(from) + "|" + getSymbolName(target));
            }
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

    private void writeNotes(File file, List<TargetResolution> resolutions) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Metadata Target Descriptor Analysis\n\n");
        builder.append("This export focuses on the 02B5.. descriptor records paired with the important metadata/state codes.\n\n");
        builder.append("## Seed targets\n\n");
        for (TargetResolution res : resolutions) {
            builder.append("- ").append(res.name).append(" @ ").append(addressToString(res.address)).append(" status=").append(res.status).append("\n");
        }
        builder.append("\n## Analysis goals\n\n");
        builder.append("- determine whether these records are descriptors, metadata tables, or state definitions.\n");
        builder.append("- compare the 02B5.. targets against the code families `0x8015xxxx`, `0x2015xxxx`, and `0x0015xxxx`.\n");
        builder.append("- check for semantic scalars, strings, names, and branching/class-type indicators.\n");
        builder.append("\n## Notes\n\n");
        builder.append("- The export includes raw dumps, pointer/integer/byte scans, xrefs, and similarity grouping.\n");
        builder.append("- If the 02B5.. records are descriptor objects, they should show repeated structured layouts and pointer references into the next payload layer.\n");
        builder.append("- If they are metadata tables or state definitions, the integer and byte fields should contain small enums or flags rather than raw pointers.\n");
        builder.append("\n## Next exact target\n\n");
        builder.append("- inspect raw `02B5...` memory for common header signatures, string references, or repeated type codes.\n");
        builder.append("- compare `02B5FF64` / `02B5F224` / `02B59E84` / `02B59EA4` / `02B59EE4` / `02B5F204` / `02B5F294` / `02B5F2D4` / `02B5FF84` / `02B5FF94`.\n");
        builder.append("- use xrefs to see whether these descriptors are referenced by placement code or only by other metadata descriptors.\n");
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
