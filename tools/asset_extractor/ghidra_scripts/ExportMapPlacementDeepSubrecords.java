// Deep subrecord export for Kingdom Adventures map placement analysis.
// This script is a focused Ghidra export for the next inspection layer.
// It targets specific 02AF subrecord roots and the parent payload families
// that directly point into them.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ExportMapPlacementDeepSubrecords extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-deep-subrecords";

    private static final TargetSpec[] TARGET_SEEDS = new TargetSpec[] {
        new TargetSpec("PARENT_PAYLOAD_02A0EA54", 0x02A0EA54L),
        new TargetSpec("PARENT_PAYLOAD_02A0EDBC", 0x02A0EDBCL),
        new TargetSpec("PARENT_PAYLOAD_02A10FF4", 0x02A10FF4L),
        new TargetSpec("PARENT_PAYLOAD_02A1192C", 0x02A1192CL),
        new TargetSpec("PARENT_PAYLOAD_02A11934", 0x02A11934L),
        new TargetSpec("PARENT_PAYLOAD_02A11944", 0x02A11944L),
        new TargetSpec("PARENT_PAYLOAD_02A1196C", 0x02A1196CL),
        new TargetSpec("PARENT_PAYLOAD_02A1117C", 0x02A1117CL),
        new TargetSpec("DEEP_ROOT_02AF4FCC", 0x02AF4FCCL),
        new TargetSpec("DEEP_ROOT_02AF5230", 0x02AF5230L),
        new TargetSpec("DEEP_ROOT_02AF5284", 0x02AF5284L),
        new TargetSpec("DEEP_ROOT_02AF7234", 0x02AF7234L),
        new TargetSpec("DEEP_ROOT_02AF7240", 0x02AF7240L),
        new TargetSpec("DEEP_ROOT_02AF729C", 0x02AF729CL),
        new TargetSpec("DEEP_ROOT_02AF7648", 0x02AF7648L),
        new TargetSpec("DEEP_ROOT_02AF7680", 0x02AF7680L),
        new TargetSpec("DEEP_ROOT_02AF76CC", 0x02AF76CCL)
    };

    private static final String[] DEEP_FAMILY_PREFIXES = new String[] {
        "02af4",
        "02af5",
        "02af52",
        "02af71",
        "02af72",
        "02af76"
    };

    private static final int LAYOUT_SCAN_BYTES = 128;
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

        File rootsFile = new File(outDir, "deep_subrecord_roots.tsv");
        File layoutsFile = new File(outDir, "deep_subrecord_layouts.tsv");
        File integerFieldsFile = new File(outDir, "deep_subrecord_integer_fields.tsv");
        File pointerWalkFile = new File(outDir, "deep_subrecord_pointer_walk.tsv");
        File similarityFile = new File(outDir, "deep_subrecord_similarity.tsv");
        File notesFile = new File(outDir, "deep_subrecord_semantic_notes.md");

        List<TargetResolution> targetResolutions = resolveTargets(imageBase);
        Set<Address> seedAddresses = collectAddresses(targetResolutions);
        Set<Address> depth1Targets = collectPointerTargets(seedAddresses, POINTER_SCAN_DEPTH);
        Set<Address> deepRoots = filterDeepSubrecordRoots(depth1Targets);

        writeDeepSubrecordRoots(rootsFile, targetResolutions, deepRoots);

        Set<Address> allAddresses = new HashSet<Address>(seedAddresses);
        allAddresses.addAll(deepRoots);

        List<FieldPattern> patterns = buildFieldPatterns(allAddresses);
        writeDeepSubrecordLayouts(layoutsFile, patterns);
        writeDeepSubrecordIntegerFields(integerFieldsFile, patterns);
        writeDeepSubrecordSimilarity(similarityFile, patterns);

        List<RecordPointer> pointerWalk = collectPointerWalk(allAddresses);
        writeDeepSubrecordPointerWalk(pointerWalkFile, pointerWalk);

        writeDeepSubrecordSemanticNotes(notesFile, targetResolutions, deepRoots, seedAddresses, depth1Targets);

        println("[DONE] Deep subrecord export complete. seeds=" + seedAddresses.size() + " deep_roots=" + deepRoots.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : TARGET_SEEDS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address directAddress = toAddr(String.format("0x%08X", spec.rva));
        boolean directInMemory = isAddressInMemory(directAddress);
        boolean directInstructionExists = directInMemory && currentProgram.getListing().getInstructionAt(directAddress) != null;

        Address imageBaseAddress = null;
        boolean imageBaseInMemory = false;
        boolean imageBaseInstructionExists = false;
        try {
            imageBaseAddress = imageBase.add(spec.rva);
            imageBaseInMemory = isAddressInMemory(imageBaseAddress);
            imageBaseInstructionExists = imageBaseInMemory && currentProgram.getListing().getInstructionAt(imageBaseAddress) != null;
        }
        catch (AddressOutOfBoundsException e) {
            imageBaseAddress = null;
        }

        Address chosenAddress = null;
        if (directInstructionExists) {
            chosenAddress = directAddress;
        }
        else if (imageBaseInstructionExists) {
            chosenAddress = imageBaseAddress;
        }

        String status;
        String note;
        if (chosenAddress != null) {
            status = "confirmed";
            note = "Instruction target found.";
        }
        else if ((directAddress != null && isAddressInMemory(directAddress)) || (imageBaseAddress != null && isAddressInMemory(imageBaseAddress))) {
            chosenAddress = directAddress != null && isAddressInMemory(directAddress) ? directAddress : imageBaseAddress;
            status = "data_record";
            note = "Data-only record; no instruction function at target.";
        }
        else {
            status = "failed";
            note = "Address not mapped in memory.";
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

    private Set<Address> filterDeepSubrecordRoots(Set<Address> candidates) {
        Set<Address> filtered = new HashSet<Address>();
        for (Address candidate : candidates) {
            String text = normalizeAddress(candidate);
            for (String prefix : DEEP_FAMILY_PREFIXES) {
                if (text.startsWith(prefix)) {
                    filtered.add(candidate);
                    break;
                }
            }
        }
        return filtered;
    }

    private String normalizeAddress(Address address) {
        if (address == null) {
            return "";
        }
        String text = address.toString().toLowerCase();
        if (text.startsWith("0x")) {
            text = text.substring(2);
        }
        return text;
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
            byte[] bytes = new byte[pointerSize];
            try {
                currentProgram.getMemory().getBytes(probe, bytes, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                break;
            }
            long value = toUnsignedLong(bytes);
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
            FieldType type = FieldType.UNKNOWN;
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
            if (i > 0) {
                builder.append(",");
            }
            builder.append(fields.get(i).type.token);
        }
        return new FieldPattern(address, fields, builder.toString());
    }

    private void writeDeepSubrecordRoots(File file, List<TargetResolution> resolutions, Set<Address> deepRoots) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_type|seed_name|address|symbol|status|note");
        for (TargetResolution res : resolutions) {
            lines.add("seed|" + res.name + "|" + addressToString(res.address) + "|" + getSymbolName(res.address) + "|" + res.status + "|" + sanitizeString(res.note));
        }
        for (Address root : deepRoots) {
            lines.add("subrecord|<discovered>|" + addressToString(root) + "|" + getSymbolName(root) + "|ok|selected deep root");
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeDeepSubrecordLayouts(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern|pointer_count|integer_count|zero_count|unknown_count");
        for (FieldPattern pattern : patterns) {
            if (!pattern.address.toString().toLowerCase().startsWith("0x02af")) {
                continue;
            }
            lines.add(pattern.address + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeDeepSubrecordIntegerFields(File file, List<FieldPattern> patterns) throws IOException {
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

    private void writeDeepSubrecordPointerWalk(File file, List<RecordPointer> pointers) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("record_address|offset|pointer_value|pointer_address|classification");
        for (RecordPointer pointer : pointers) {
            if (!pointer.recordAddress.toString().toLowerCase().startsWith("0x02af")) {
                continue;
            }
            lines.add(pointer.recordAddress + "|0x" + Integer.toHexString(pointer.offset).toUpperCase() + "|0x" + Long.toHexString(pointer.pointerValue).toUpperCase() + "|" + pointer.pointerAddress + "|" + pointer.classification);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeDeepSubrecordSimilarity(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("group_id|pattern|member_count|members");
        Map<String, List<Address>> groups = new HashMap<String, List<Address>>();
        for (FieldPattern pattern : patterns) {
            if (!pattern.address.toString().toLowerCase().startsWith("0x02af")) {
                continue;
            }
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

    private void writeDeepSubrecordSemanticNotes(File file, List<TargetResolution> resolutions, Set<Address> deepRoots, Set<Address> seeds, Set<Address> depth1Targets) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Deep Subrecord Semantic Notes\n\n");
        builder.append("This export is focused on the next layer beneath the 02AF root families.\n\n");
        builder.append("## Selected deep roots\n\n");
        for (Address root : deepRoots) {
            builder.append("- ").append(root).append("\n");
        }
        builder.append("\n## Parent payload families in view\n\n");
        for (TargetResolution res : resolutions) {
            if (res.name.startsWith("PARENT_PAYLOAD")) {
                builder.append("- ").append(res.name).append(" @ ").append(addressToString(res.address)).append(" status=").append(res.status).append("\n");
            }
        }
        builder.append("\n## Early findings\n\n");
        builder.append("- The selected 02AF roots still appear as pointer-only records at this layer.\n");
        builder.append("- No non-pointer integer fields were found in the inspected 02AF deep roots.\n");
        builder.append("- The current layer does not yet reveal explicit type/category IDs, counts, state values,\n");
        builder.append("  direction/orientation values, adjacency flags, or buildability markers.\n");
        builder.append("- The next semantic layer is likely the targets of these pointers, not the 02AF roots themselves.\n");
        builder.append("\n## Next most promising target\n\n");
        builder.append("- The selected roots are all still pointer arrays, so the most promising next step is to follow one or more\n");
        builder.append("  deep pointer chains from these roots into the second-level pointed records.\n");
        builder.append("- In particular, the parent payload families `02A0EA54`, `02A0EDBC`, `02A10FF4`, `02A1192C`, `02A11934`, `02A11944`, `02A1196C`, and `02A1117C`\n");
        builder.append("  should be exported and inspected alongside these 02AF roots.\n");
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

    private String addressToString(Address address) {
        return address == null ? "<none>" : address.toString();
    }

    private String sanitizeString(String input) {
        if (input == null) {
            return "";
        }
        return input.replace("\n", " ").replace("\r", " ").replace("|", " ");
    }

    private String join(List<String> items, String sep) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(sep);
            sb.append(items.get(i));
        }
        return sb.toString();
    }

    private String joinAddresses(List<Address> addresses) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < addresses.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(addresses.get(i).toString());
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
