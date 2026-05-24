// Semantic pattern export for Kingdom Adventures map placement analysis.
// This Ghidra script deeply inspects a focused set of probable semantic/state
// tables and validated data records to decode repeated integer and byte patterns.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
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

public class ExportMapPlacementSemanticPatterns extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-semantic-patterns";

    private static final TargetSpec[] ROOT_SEEDS = new TargetSpec[] {
        new TargetSpec("SEMANTIC_02B2FBEC", 0x02B2FBECL),
        new TargetSpec("SEMANTIC_02B3065C", 0x02B3065CL),
        new TargetSpec("SEMANTIC_02B30DFC", 0x02B30DFCL),
        new TargetSpec("SEMANTIC_02B31A7C", 0x02B31A7CL),
        new TargetSpec("SEMANTIC_02B2FB34", 0x02B2FB34L),
        new TargetSpec("SEMANTIC_02B2FB14", 0x02B2FB14L),
        new TargetSpec("SEMANTIC_02B30804", 0x02B30804L),
        new TargetSpec("VALIDATED_00120001", 0x00120001L),
        new TargetSpec("VALIDATED_00120003", 0x00120003L),
        new TargetSpec("VALIDATED_001702A5", 0x001702A5L)
    };

    private static final int RAW_DUMP_BYTES = 256;
    private static final int WORD_SIZE = 4;

    @Override
    public void run() throws Exception {
        println("[START] ExportMapPlacementSemanticPatterns starting...");

        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        println("[INFO] Output directory: " + outDir.getAbsolutePath());
        if (outDir.exists() && !outDir.isDirectory()) {
            throw new IOException("Output path exists but is not a directory: " + outDir.getAbsolutePath());
        }
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }

        File patternsFile = new File(outDir, "semantic_patterns.tsv");
        File groupsFile = new File(outDir, "semantic_pattern_groups.tsv");
        File integerSeqFile = new File(outDir, "semantic_integer_sequences.tsv");
        File byteSeqFile = new File(outDir, "semantic_byte_sequences.tsv");
        File offsetsFile = new File(outDir, "semantic_repeating_offsets.tsv");
        File enumFile = new File(outDir, "semantic_candidate_enums.tsv");
        File bitmaskFile = new File(outDir, "semantic_candidate_bitmasks.tsv");
        File transitionFile = new File(outDir, "semantic_transition_patterns.tsv");
        File notesFile = new File(outDir, "semantic_state_notes.md");
        File rawIndexFile = new File(outDir, "semantic_pattern_raw_memory_index.tsv");

        List<TargetResolution> roots = resolveRoots();
        Set<Address> rootAddresses = collectAddresses(roots);
        if (rootAddresses.isEmpty()) {
            throw new IllegalStateException("No semantic pattern roots resolved.");
        }

        List<RecordPattern> records = buildRecordPatterns(rootAddresses);
        writeSemanticPatterns(patternsFile, records);
        writePatternGroups(groupsFile, records);
        writeIntegerSequences(integerSeqFile, records);
        writeByteSequences(byteSeqFile, records);
        writeRepeatingOffsets(offsetsFile, records);
        writeCandidateEnums(enumFile, records);
        writeCandidateBitmasks(bitmaskFile, records);
        writeTransitionPatterns(transitionFile, records);
        writeRawMemoryDumps(outDir, rawIndexFile, records);
        writeNotes(notesFile, roots, records);

        println("[DONE] Semantic pattern export complete. records=" + records.size());
    }

    private List<TargetResolution> resolveRoots() {
        List<TargetResolution> roots = new ArrayList<TargetResolution>();
        for (TargetSpec spec : ROOT_SEEDS) {
            Address address = toAddr(String.format("0x%08X", spec.rva));
            boolean resolved = isAddressInMemory(address);
            String status = resolved ? "resolved" : "unmapped";
            String type = resolved ? (getFunctionContaining(address) != null ? "code" : "data") : "unknown";
            String note = resolved ? "Root maps to " + type + "." : "Root is not mapped in memory.";
            println("[ROOT] " + spec.name + " " + address + " status=" + status + " type=" + type);
            roots.add(new TargetResolution(spec.name, spec.rva, address, status, type, note));
        }
        return roots;
    }

    private Set<Address> collectAddresses(List<TargetResolution> roots) {
        Set<Address> addresses = new HashSet<Address>();
        for (TargetResolution root : roots) {
            if (root.address != null && isAddressInMemory(root.address)) {
                addresses.add(root.address);
            }
        }
        return addresses;
    }

    private List<RecordPattern> buildRecordPatterns(Set<Address> addresses) {
        List<RecordPattern> records = new ArrayList<RecordPattern>();
        for (Address address : addresses) {
            records.add(scanRecordPattern(address, RAW_DUMP_BYTES));
        }
        return records;
    }

    private RecordPattern scanRecordPattern(Address address, int bytes) {
        List<FieldInfo> fields = new ArrayList<FieldInfo>();
        byte[] raw = new byte[bytes];
        try {
            currentProgram.getMemory().getBytes(address, raw, 0, raw.length);
        }
        catch (MemoryAccessException e) {
            throw new RuntimeException("Unable to read record bytes for " + address, e);
        }

        for (int offset = 0; offset < bytes; offset += WORD_SIZE) {
            long value = toUnsignedLong(raw, offset, WORD_SIZE);
            Address pointerTarget = toAddr(String.format("0x%X", value));
            String classification;
            if (value == 0L) {
                classification = "zero";
            }
            else if (pointerTarget != null && isAddressInMemory(pointerTarget)) {
                if (getFunctionContaining(pointerTarget) != null) {
                    classification = "pointer->code";
                }
                else {
                    classification = "pointer->data";
                }
            }
            else if (isConstantLikeValue(value)) {
                classification = "constant-like";
            }
            else if (isBitmaskCandidate(value)) {
                classification = "bitmask-candidate";
            }
            else if (isEnumCandidate(value)) {
                classification = "enum-candidate";
            }
            else {
                classification = "integer";
            }
            fields.add(new FieldInfo(offset, value, pointerTarget, classification));
        }

        List<ByteField> bytesList = new ArrayList<ByteField>();
        for (int offset = 0; offset < raw.length; offset++) {
            int value = raw[offset] & 0xFF;
            if (value == 0) continue;
            if (value <= 0x0F || value >= 0xF0 || value == 0x6 || value == 0x8) {
                bytesList.add(new ByteField(offset, value));
            }
        }

        return new RecordPattern(address, fields, bytesList);
    }

    private void writeSemanticPatterns(File file, List<RecordPattern> records) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|value_hex|value_dec|classification|target_address");
        for (RecordPattern record : records) {
            for (FieldInfo field : record.fields) {
                lines.add(record.address + "|0x" + Integer.toHexString(field.offset).toUpperCase() + "|0x" + Long.toHexString(field.value).toUpperCase() + "|" + field.value + "|" + field.classification + "|" + addressToString(field.pointerTarget));
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writePatternGroups(File file, List<RecordPattern> records) throws IOException {
        Map<String, List<Address>> groups = new HashMap<String, List<Address>>();
        for (RecordPattern record : records) {
            StringBuilder builder = new StringBuilder();
            for (FieldInfo field : record.fields) {
                builder.append(field.classification.charAt(0));
            }
            String pattern = builder.toString();
            groups.computeIfAbsent(pattern, k -> new ArrayList<Address>()).add(record.address);
        }
        List<String> lines = new ArrayList<String>();
        lines.add("pattern|member_count|members");
        int groupId = 1;
        for (Map.Entry<String, List<Address>> entry : groups.entrySet()) {
            List<Address> members = entry.getValue();
            Collections.sort(members);
            lines.add("G" + groupId + "|" + members.size() + "|" + joinAddresses(members));
            groupId++;
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeIntegerSequences(File file, List<RecordPattern> records) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|sequence_type|start_offset|length|details");
        for (RecordPattern record : records) {
            List<FieldInfo> ints = record.getFieldsByCategory("integer");
            if (!ints.isEmpty()) {
                lines.add(record.address + "|integer-run|0|" + ints.size() + "|count=" + ints.size());
            }
            List<FieldInfo> enums = record.getFieldsByCategory("enum-candidate");
            if (!enums.isEmpty()) {
                lines.add(record.address + "|enum-candidate|0|" + enums.size() + "|count=" + enums.size());
            }
            List<FieldInfo> consts = record.getFieldsByCategory("constant-like");
            if (!consts.isEmpty()) {
                lines.add(record.address + "|constant-like|0|" + consts.size() + "|count=" + consts.size());
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeByteSequences(File file, List<RecordPattern> records) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|offset|byte_hex|byte_dec");
        for (RecordPattern record : records) {
            for (ByteField byteField : record.bytes) {
                lines.add(record.address + "|0x" + Integer.toHexString(byteField.offset).toUpperCase() + "|0x" + Integer.toHexString(byteField.value).toUpperCase() + "|" + byteField.value);
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeRepeatingOffsets(File file, List<RecordPattern> records) throws IOException {
        Map<Integer, Map<Long, Integer>> offsetCounts = new HashMap<Integer, Map<Long, Integer>>();
        for (RecordPattern record : records) {
            for (FieldInfo field : record.fields) {
                offsetCounts.computeIfAbsent(field.offset, k -> new HashMap<Long, Integer>());
                Map<Long, Integer> valueCounts = offsetCounts.get(field.offset);
                valueCounts.put(field.value, valueCounts.getOrDefault(field.value, 0) + 1);
            }
        }
        List<String> lines = new ArrayList<String>();
        lines.add("offset|value_hex|value_dec|count");
        for (Map.Entry<Integer, Map<Long, Integer>> entry : offsetCounts.entrySet()) {
            int offset = entry.getKey();
            for (Map.Entry<Long, Integer> valueEntry : entry.getValue().entrySet()) {
                if (valueEntry.getValue() > 1) {
                    lines.add("0x" + Integer.toHexString(offset).toUpperCase() + "|0x" + Long.toHexString(valueEntry.getKey()).toUpperCase() + "|" + valueEntry.getKey() + "|" + valueEntry.getValue());
                }
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeCandidateEnums(File file, List<RecordPattern> records) throws IOException {
        Map<Long, Integer> counts = new HashMap<Long, Integer>();
        for (RecordPattern record : records) {
            for (FieldInfo field : record.fields) {
                if ("enum-candidate".equals(field.classification) || "constant-like".equals(field.classification)) {
                    counts.put(field.value, counts.getOrDefault(field.value, 0) + 1);
                }
            }
        }
        List<String> lines = new ArrayList<String>();
        lines.add("value_hex|value_dec|count");
        List<Long> sorted = new ArrayList<Long>(counts.keySet());
        Collections.sort(sorted);
        for (Long value : sorted) {
            if (counts.get(value) > 1) {
                lines.add("0x" + Long.toHexString(value).toUpperCase() + "|" + value + "|" + counts.get(value));
            }
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeCandidateBitmasks(File file, List<RecordPattern> records) throws IOException {
        Map<Long, Integer> counts = new HashMap<Long, Integer>();
        for (RecordPattern record : records) {
            for (FieldInfo field : record.fields) {
                if ("bitmask-candidate".equals(field.classification)) {
                    counts.put(field.value, counts.getOrDefault(field.value, 0) + 1);
                }
            }
        }
        List<String> lines = new ArrayList<String>();
        lines.add("value_hex|value_dec|count|bit_count");
        List<Long> sorted = new ArrayList<Long>(counts.keySet());
        Collections.sort(sorted);
        for (Long value : sorted) {
            lines.add("0x" + Long.toHexString(value).toUpperCase() + "|" + value + "|" + counts.get(value) + "|" + Long.bitCount(value));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeTransitionPatterns(File file, List<RecordPattern> records) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern_type|description");
        for (RecordPattern record : records) {
            TransitionPattern transition = record.detectTransition();
            lines.add(record.address + "|" + transition.type + "|" + transition.description);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeRawMemoryDumps(File outDir, File indexFile, Collection<RecordPattern> records) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|dump_file|byte_count");
        for (RecordPattern record : records) {
            String name = "raw_" + record.address.toString().replace(":", "_").replace("0x", "") + ".bin";
            File file = new File(outDir, name);
            byte[] raw = new byte[RAW_DUMP_BYTES];
            try {
                currentProgram.getMemory().getBytes(record.address, raw, 0, raw.length);
            }
            catch (MemoryAccessException e) {
                throw new IOException("Unable to read raw memory dump for " + record.address, e);
            }
            FileOutputStream out = new FileOutputStream(file);
            out.write(raw);
            out.close();
            lines.add(record.address + "|" + name + "|" + raw.length);
        }
        writeFile(indexFile, join(lines, "\n") + "\n");
    }

    private void writeNotes(File file, List<TargetResolution> roots, List<RecordPattern> records) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Semantic state-pattern decoding\n\n");
        builder.append("This export inspects the focused semantic/state records and validated data roots to decode repeated integer and byte patterns.\n\n");
        builder.append("## Target records\n\n");
        for (TargetResolution root : roots) {
            builder.append("- ").append(root.name).append(" @ ").append(addressToString(root.address)).append(" status=").append(root.status).append(" type=").append(root.addressType).append(" note=").append(root.note).append("\n");
        }
        builder.append("\n## Analysis goals\n\n");
        builder.append("- decode repeated integer sequences into enum/state or transition tables.\n");
        builder.append("- detect incrementing enums, repeated state groups, bitmask-like values, directional cycles, adjacency-state patterns, terrain/buildability patterns, and placement-state transitions.\n");
        builder.append("- compare which fields stay constant across records and which vary systematically.\n");
        builder.append("- determine whether the records resemble adjacency rule tables, orientation/state tables, terrain transition tables, placement mode tables, or multi-tile structure state tables.\n");
        builder.append("\n## Output guide\n\n");
        builder.append("- semantic_patterns.tsv: field-level classifications for every 4-byte word.\n");
        builder.append("- semantic_pattern_groups.tsv: grouped type patterns across records.\n");
        builder.append("- semantic_integer_sequences.tsv: integer and enum candidate sequence summaries.\n");
        builder.append("- semantic_byte_sequences.tsv: byte-offset sequence summaries and candidate flags.\n");
        builder.append("- semantic_repeating_offsets.tsv: offsets with repeated values across multiple records.\n");
        builder.append("- semantic_candidate_enums.tsv: repeated candidate enum values.\n");
        builder.append("- semantic_candidate_bitmasks.tsv: repeated bitmask-like values.\n");
        builder.append("- semantic_transition_patterns.tsv: detected incremental or cyclic transitions.\n");
        builder.append("- semantic_state_notes.md: summary and interpretation notes.\n");
        writeFile(file, builder.toString());
    }

    private boolean isConstantLikeValue(long value) {
        if (value == 0L) {
            return false;
        }
        if (value < 0x100L) {
            return true;
        }
        if ((value & 0xFFFFL) == 0x0000L) {
            return true;
        }
        if ((value & 0xFFFF0000L) == 0x00120000L) {
            return true;
        }
        if ((value & 0xFFFF0000L) == 0x00170000L) {
            return true;
        }
        if ((value & 0xFF00FFFFL) == 0x00150000L) {
            return true;
        }
        return false;
    }

    private boolean isBitmaskCandidate(long value) {
        if (value <= 0L) {
            return false;
        }
        int bits = Long.bitCount(value);
        return bits <= 3 && value <= 0xFFFFL;
    }

    private boolean isEnumCandidate(long value) {
        return value > 0 && value < 0x1000L && !isBitmaskCandidate(value);
    }

    private long toUnsignedLong(byte[] raw, int offset, int length) {
        long value = 0L;
        for (int i = 0; i < length; i++) {
            value |= ((long) raw[offset + i] & 0xFFL) << (8 * i);
        }
        return value;
    }

    private String addressToString(Address address) {
        return address == null ? "<none>" : address.toString();
    }

    private void writeFile(File file, String content) throws IOException {
        println("[WRITE] " + file.getAbsolutePath());
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write(content);
        writer.close();
        if (!file.exists()) {
            throw new IOException("File write failed: " + file.getAbsolutePath());
        }
    }

    private String join(List<String> items, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(items.get(i));
        }
        return sb.toString();
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
        public final String addressType;
        public final String note;
        public TargetResolution(String name, long rva, Address address, String status, String addressType, String note) {
            this.name = name;
            this.rva = rva;
            this.address = address;
            this.status = status;
            this.addressType = addressType;
            this.note = note;
        }
    }

    private static class RecordPattern {
        public final Address address;
        public final List<FieldInfo> fields;
        public final List<ByteField> bytes;
        public RecordPattern(Address address, List<FieldInfo> fields, List<ByteField> bytes) {
            this.address = address;
            this.fields = fields;
            this.bytes = bytes;
        }
        public List<FieldInfo> getFieldsByCategory(String category) {
            List<FieldInfo> result = new ArrayList<FieldInfo>();
            for (FieldInfo field : fields) {
                if (field.classification.equals(category)) {
                    result.add(field);
                }
            }
            return result;
        }
        public TransitionPattern detectTransition() {
            if (fields.size() < 3) {
                return new TransitionPattern("none", "record too short");
            }
            long first = fields.get(0).value;
            long second = fields.get(1).value;
            long diff = second - first;
            boolean arithmetic = true;
            for (int i = 2; i < fields.size(); i++) {
                if (fields.get(i).value - fields.get(i - 1).value != diff) {
                    arithmetic = false;
                    break;
                }
            }
            if (arithmetic && diff != 0) {
                return new TransitionPattern("arithmetic", "step=" + diff);
            }
            long same = 0;
            for (FieldInfo field : fields) {
                if (field.value == first) {
                    same++;
                }
            }
            if (same == fields.size()) {
                return new TransitionPattern("constant", "all values identical");
            }
            return new TransitionPattern("none", "no simple transition detected");
        }
    }

    private static class FieldInfo {
        public final int offset;
        public final long value;
        public final Address pointerTarget;
        public final String classification;
        public FieldInfo(int offset, long value, Address pointerTarget, String classification) {
            this.offset = offset;
            this.value = value;
            this.pointerTarget = pointerTarget;
            this.classification = classification;
        }
    }

    private static class ByteField {
        public final int offset;
        public final int value;
        public ByteField(int offset, int value) {
            this.offset = offset;
            this.value = value;
        }
    }

    private static class TransitionPattern {
        public final String type;
        public final String description;
        public TransitionPattern(String type, String description) {
            this.type = type;
            this.description = description;
        }
    }
}
