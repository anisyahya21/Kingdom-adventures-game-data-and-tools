// Semantic leaf graph export for Kingdom Adventures map placement analysis.
// This Ghidra script performs bounded depth-3 exploration from selected semantic
// leaf candidates and validates whether suspicious values are real data records,
// encoded constants, or misclassified pointer-like values.

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

public class ExportMapPlacementSemanticLeavesDepth3 extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-semantic-leaves-depth3";

    private static final TargetSpec[] ROOT_SEEDS = new TargetSpec[] {
        new TargetSpec("SEMANTIC_LEAF_02B2FBEC", 0x02B2FBECL),
        new TargetSpec("SEMANTIC_LEAF_02B3065C", 0x02B3065CL),
        new TargetSpec("SEMANTIC_LEAF_02B2FB34", 0x02B2FB34L),
        new TargetSpec("SEMANTIC_LEAF_02B2FB14", 0x02B2FB14L),
        new TargetSpec("SEMANTIC_LEAF_02B30DFC", 0x02B30DFCL),
        new TargetSpec("SEMANTIC_LEAF_02B31A7C", 0x02B31A7CL),
        new TargetSpec("SEMANTIC_LEAF_02B30804", 0x02B30804L),
        new TargetSpec("SUSPICIOUS_00120001", 0x00120001L),
        new TargetSpec("SUSPICIOUS_00120003", 0x00120003L),
        new TargetSpec("SUSPICIOUS_001702A5", 0x001702A5L)
    };

    private static final int GRAPH_DEPTH = 3;
    private static final int MAX_CHILDREN_PER_NODE = 8;
    private static final int MAX_TOTAL_NODES = 300;
    private static final int POINTER_LAYOUT_BYTES = 256;
    private static final int RAW_DUMP_BYTES = 256;

    @Override
    public void run() throws Exception {
        println("[START] ExportMapPlacementSemanticLeavesDepth3 starting...");

        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        println("[INFO] Desired output directory: " + DEFAULT_OUTPUT_DIR);
        println("[INFO] Absolute output directory: " + outDir.getAbsolutePath());
        if (outDir.exists() && !outDir.isDirectory()) {
            throw new IOException("Output path exists but is not a directory: " + outDir.getAbsolutePath());
        }
        if (!outDir.exists()) {
            println("[INFO] Creating output directory...");
            if (!outDir.mkdirs()) {
                throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
            }
            println("[INFO] Created output directory: " + outDir.getAbsolutePath());
        }

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File rootsFile = new File(outDir, "semantic_leaf_roots.tsv");
        File nodesFile = new File(outDir, "semantic_leaf_nodes.tsv");
        File edgesFile = new File(outDir, "semantic_leaf_edges.tsv");
        File layoutsFile = new File(outDir, "semantic_leaf_layouts.tsv");
        File integerFieldsFile = new File(outDir, "semantic_leaf_integer_fields.tsv");
        File byteFlagsFile = new File(outDir, "semantic_leaf_byte_flags.tsv");
        File similarityFile = new File(outDir, "semantic_leaf_similarity.tsv");
        File validationFile = new File(outDir, "semantic_leaf_constant_validation.tsv");
        File candidatesFile = new File(outDir, "semantic_leaf_candidates.tsv");
        File notesFile = new File(outDir, "semantic_leaf_notes.md");
        File rawIndexFile = new File(outDir, "semantic_leaf_raw_memory_index.tsv");

        List<TargetResolution> rootResolutions = resolveRoots(imageBase);
        println("[INFO] Seed count: " + ROOT_SEEDS.length);
        println("[INFO] Root resolutions count: " + rootResolutions.size());

        Set<Address> rootAddresses = collectAddresses(rootResolutions);
        println("[INFO] Resolved root addresses in memory: " + rootAddresses.size());
        if (rootAddresses.isEmpty()) {
            println("[WARN] No resolved root addresses were found. Suspicious seeds may have been classified as constants.");
        }

        Graph graph = traverseGraph(rootAddresses);
        println("[INFO] Graph traversal complete. node count=" + graph.nodes.size() + " edge count=" + graph.edges.size());
        if (graph.nodes.isEmpty()) {
            println("[WARN] Graph yielded zero nodes. Export will continue to write the validation and root files.");
        }

        writeRoots(rootsFile, rootResolutions);
        writeConstantValidation(validationFile, rootResolutions);
        writeNodes(nodesFile, graph.nodes);
        writeEdges(edgesFile, graph.edges);
        writeLayouts(layoutsFile, graph.patterns);
        writeIntegerFields(integerFieldsFile, graph.patterns);
        writeByteFlags(byteFlagsFile, graph.nodes);
        writeSimilarity(similarityFile, graph.patterns);
        writeLeafCandidates(candidatesFile, graph.nodes);
        writeRawMemoryDumps(outDir, rawIndexFile, graph.nodes.values());
        writeNotes(notesFile, rootResolutions, graph);

        println("[DONE] Semantic leaf graph export complete. roots=" + rootResolutions.size() + " nodes=" + graph.nodes.size() + " edges=" + graph.edges.size());
    }

    private List<TargetResolution> resolveRoots(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : ROOT_SEEDS) {
            resolutions.add(resolveRoot(spec));
        }
        return resolutions;
    }

    private TargetResolution resolveRoot(TargetSpec spec) {
        Address address = toAddr(String.format("0x%08X", spec.rva));
        boolean inMemory = isAddressInMemory(address);
        Function function = inMemory ? getFunctionContaining(address) : null;
        String addressType = !inMemory ? "unmapped" : (function != null ? "code" : "data");
        String status = inMemory ? "resolved" : "unmapped";
        String note;
        if (!inMemory) {
            note = "Root is not mapped in memory; likely constant-like or misclassified pointer.";
        }
        else if (function != null) {
            note = "Root maps to code; traversal will skip code regions.";
        }
        else {
            note = "Root maps to data.";
        }
        println("[ROOT] " + spec.name + " " + addressToString(address) + " status=" + status + " type=" + addressType);
        return new TargetResolution(spec.name, spec.rva, address, status, addressType, note);
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

    private Graph traverseGraph(Set<Address> roots) {
        Graph graph = new Graph();
        for (Address root : roots) {
            if (graph.nodes.size() >= MAX_TOTAL_NODES) {
                break;
            }
            graph.addNode(root, 0);
        }

        List<Node> queue = new ArrayList<Node>(graph.nodes.values());
        for (int i = 0; i < queue.size(); i++) {
            Node node = queue.get(i);
            if (node.depth >= GRAPH_DEPTH) {
                continue;
            }
            if (graph.nodes.size() >= MAX_TOTAL_NODES) {
                break;
            }
            if (!isDataRegion(node.address)) {
                continue;
            }
            List<RecordPointer> pointers = scanPointers(node.address, POINTER_LAYOUT_BYTES);
            int childLimit = 0;
            for (RecordPointer pointer : pointers) {
                if (childLimit >= MAX_CHILDREN_PER_NODE) {
                    break;
                }
                Address target = pointer.pointerAddress;
                if (target == null || !isAddressInMemory(target)) {
                    continue;
                }
                Node child = graph.nodesByAddress.get(target);
                if (child == null) {
                    if (graph.nodes.size() >= MAX_TOTAL_NODES) {
                        break;
                    }
                    child = graph.addNode(target, node.depth + 1);
                    queue.add(child);
                }
                graph.addEdge(node, child, pointer.offset, pointer.pointerValue, pointer.classification);
                childLimit++;
            }
        }
        graph.computePatterns();
        return graph;
    }

    private boolean isDataRegion(Address address) {
        if (address == null) {
            return false;
        }
        Function function = getFunctionContaining(address);
        return function == null;
    }

    private List<RecordPointer> scanPointers(Address address, int bytes) {
        List<RecordPointer> pointers = new ArrayList<RecordPointer>();
        int pointerSize = currentProgram.getDefaultPointerSize();
        for (int offset = 0; offset < bytes; offset += pointerSize) {
            Address probe = address.add(offset);
            byte[] raw = new byte[pointerSize];
            try {
                currentProgram.getMemory().getBytes(probe, raw, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                break;
            }
            long value = toUnsignedLong(raw);
            if (value == 0L) {
                continue;
            }
            Address target = toAddr(String.format("0x%X", value));
            String classification = classifyPointerTarget(value, target);
            pointers.add(new RecordPointer(address, offset, value, target, classification));
        }
        return pointers;
    }

    private void writeRoots(File file, List<TargetResolution> roots) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("root_name|address|symbol|status|address_type|note");
        for (TargetResolution root : roots) {
            lines.add(root.name + "|" + addressToString(root.address) + "|" + getSymbolName(root.address) + "|" + root.status + "|" + root.addressType + "|" + sanitizeString(root.note));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeConstantValidation(File file, List<TargetResolution> roots) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("root_name|address|resolved|address_type|symbol|classification|note");
        for (TargetResolution root : roots) {
            String classification = "unknown";
            if (root.address != null && isAddressInMemory(root.address)) {
                classification = root.addressType.equals("data") ? "data" : "code";
            }
            else {
                classification = classifyConstantLike(root.rva);
            }
            lines.add(root.name + "|" + addressToString(root.address) + "|" + (root.address != null && isAddressInMemory(root.address) ? "true" : "false") + "|" + root.addressType + "|" + getSymbolName(root.address) + "|" + classification + "|" + sanitizeString(root.note));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeNodes(File file, Map<Integer, Node> nodes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("node_id|address|depth|address_type|symbol|pointer_count|integer_count|zero_count|unknown_count|constant_like_count|byte_flag_count");
        List<Node> sorted = new ArrayList<Node>(nodes.values());
        Collections.sort(sorted, new Comparator<Node>() {
            @Override
            public int compare(Node a, Node b) {
                return Integer.compare(a.id, b.id);
            }
        });
        for (Node node : sorted) {
            lines.add(node.id + "|" + node.address + "|" + node.depth + "|" + node.addressType + "|" + getSymbolName(node.address) + "|" + node.pointerCount + "|" + node.integerCount + "|" + node.zeroCount + "|" + node.unknownCount + "|" + node.constantLikeCount + "|" + node.byteFlagCount);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeEdges(File file, List<GraphEdge> edges) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("from_node_id|from_address|to_node_id|to_address|offset|pointer_value|classification");
        for (GraphEdge edge : edges) {
            lines.add(edge.from.id + "|" + edge.from.address + "|" + edge.to.id + "|" + edge.to.address + "|0x" + Integer.toHexString(edge.offset).toUpperCase() + "|0x" + Long.toHexString(edge.pointerValue).toUpperCase() + "|" + edge.classification);
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeLayouts(File file, List<FieldPattern> patterns) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|pattern|pointer_count|integer_count|zero_count|unknown_count|constant_like_count");
        for (FieldPattern pattern : patterns) {
            lines.add(pattern.address + "|" + pattern.pattern + "|" + pattern.countType(FieldType.POINTER) + "|" + pattern.countType(FieldType.INTEGER) + "|" + pattern.countType(FieldType.ZERO) + "|" + pattern.countType(FieldType.UNKNOWN) + "|" + pattern.countType(FieldType.CONSTANT_LIKE));
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

    private void writeByteFlags(File file, Map<Integer, Node> nodes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("node_id|address|offset|byte_hex|byte_dec");
        for (Node node : nodes.values()) {
            byte[] raw = new byte[RAW_DUMP_BYTES];
            try {
                currentProgram.getMemory().getBytes(node.address, raw, 0, raw.length);
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
                    lines.add(node.id + "|" + node.address + "|0x" + Integer.toHexString(i).toUpperCase() + "|0x" + Integer.toHexString(value).toUpperCase() + "|" + value);
                }
            }
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

    private void writeLeafCandidates(File file, Map<Integer, Node> nodes) throws IOException {
        List<Node> candidates = new ArrayList<Node>();
        for (Node node : nodes.values()) {
            if (node.pointerCount == 0 || node.integerCount > 0 || node.constantLikeCount > 0 || node.depth == GRAPH_DEPTH) {
                candidates.add(node);
            }
        }
        Collections.sort(candidates, new Comparator<Node>() {
            @Override
            public int compare(Node a, Node b) {
                int scoreA = a.integerCount * 100 + a.constantLikeCount * 50 + a.byteFlagCount * 10 + (a.pointerCount == 0 ? 50 : 0) + a.depth;
                int scoreB = b.integerCount * 100 + b.constantLikeCount * 50 + b.byteFlagCount * 10 + (b.pointerCount == 0 ? 50 : 0) + b.depth;
                return Integer.compare(scoreB, scoreA);
            }
        });
        List<String> lines = new ArrayList<String>();
        lines.add("rank|node_id|address|depth|pointer_count|integer_count|constant_like_count|byte_flag_count|score|reason");
        int rank = 1;
        for (Node node : candidates) {
            if (rank > 10) {
                break;
            }
            int score = node.integerCount * 100 + node.constantLikeCount * 50 + node.byteFlagCount * 10 + (node.pointerCount == 0 ? 50 : 0) + node.depth;
            String reason;
            if (node.pointerCount == 0) {
                reason = "pointer-only leaf";
            }
            else if (node.constantLikeCount > 0) {
                reason = "constant-like fields present";
            }
            else if (node.integerCount > 0) {
                reason = "scalar values present";
            }
            else {
                reason = "depth limit or byte flags";
            }
            lines.add(rank + "|" + node.id + "|" + node.address + "|" + node.depth + "|" + node.pointerCount + "|" + node.integerCount + "|" + node.constantLikeCount + "|" + node.byteFlagCount + "|" + score + "|" + reason);
            rank++;
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeRawMemoryDumps(File outDir, File indexFile, Collection<Node> nodes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("address|dump_file|byte_count");
        for (Node node : nodes) {
            String name = "raw_" + node.address.toString().replace(':', '_').replace("0x", "") + ".bin";
            File file = new File(outDir, name);
            byte[] raw = new byte[RAW_DUMP_BYTES];
            try {
                currentProgram.getMemory().getBytes(node.address, raw, 0, raw.length);
            }
            catch (MemoryAccessException e) {
                continue;
            }
            FileOutputStream out = new FileOutputStream(file);
            out.write(raw);
            out.close();
            lines.add(node.address + "|" + name + "|" + raw.length);
        }
        writeFile(indexFile, join(lines, "\n") + "\n");
    }

    private void writeNotes(File file, List<TargetResolution> roots, Graph graph) throws IOException {
        StringBuilder builder = new StringBuilder();
        builder.append("# Semantic leaf depth-3 analysis\n\n");
        builder.append("This export explores the strongest semantic leaf candidates and validates whether suspicious pointer-like values are real data records or encoded constants.\n\n");
        builder.append("## Traversal configuration\n\n");
        builder.append("- root candidates: the selected semantic leaf targets plus suspicious values.\n");
        builder.append("- graph depth: ").append(GRAPH_DEPTH).append(".\n");
        builder.append("- max children per node: ").append(MAX_CHILDREN_PER_NODE).append(".\n");
        builder.append("- max total nodes: ").append(MAX_TOTAL_NODES).append(".\n");
        builder.append("- pointer layout scan: ").append(POINTER_LAYOUT_BYTES).append(" bytes.\n");
        builder.append("- raw dump size: ").append(RAW_DUMP_BYTES).append(" bytes per node.\n\n");
        builder.append("## Required outputs\n\n");
        builder.append("- semantic_leaf_roots.tsv\n");
        builder.append("- semantic_leaf_nodes.tsv\n");
        builder.append("- semantic_leaf_edges.tsv\n");
        builder.append("- semantic_leaf_layouts.tsv\n");
        builder.append("- semantic_leaf_integer_fields.tsv\n");
        builder.append("- semantic_leaf_byte_flags.tsv\n");
        builder.append("- semantic_leaf_similarity.tsv\n");
        builder.append("- semantic_leaf_constant_validation.tsv\n");
        builder.append("- semantic_leaf_candidates.tsv\n");
        builder.append("- semantic_leaf_notes.md\n");
        builder.append("- raw_*.bin dumps for each explored node.\n\n");
        builder.append("## Analysis goals\n\n");
        builder.append("- determine whether the primary 02B2.../02B3... leaf candidates contain actual semantic tables.\n");
        builder.append("- decode repeated integer and byte patterns.\n");
        builder.append("- identify enum/state values, adjacency masks, orientation markers, connection rules, terrain/buildability flags, placement mode IDs, or footprint/size values.\n");
        builder.append("- separate real data records from encoded constants or false pointer classifications.\n");
        builder.append("- find the top 10 records most likely to represent real placement/world-builder rules.\n\n");
        builder.append("## Suspicious candidate validation\n\n");
        builder.append("- `00120001`, `00120003`, and `001702a5` are included as suspicious seeds.\n");
        builder.append("- the export will classify them as mapped data, code, or constant-like.\n");
        builder.append("- if they are not mapped, they should be treated as encoded constants or false pointer values.\n");
        writeFile(file, builder.toString());
    }

    private String classifyPointerTarget(long value, Address target) {
        if (target != null && isAddressInMemory(target)) {
            Function function = getFunctionContaining(target);
            if (function != null) {
                return "code";
            }
            Data data = currentProgram.getListing().getDataAt(target);
            if (data != null && data.getValue() instanceof String) {
                return "string";
            }
            Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(target);
            if (symbol != null) {
                String name = symbol.getName();
                if (name.startsWith("PTR_DAT_") || name.startsWith("DAT_") || name.toUpperCase().contains("META")) {
                    return "metadata";
                }
                return "data";
            }
            return "data";
        }
        if (isConstantLikeValue(value)) {
            return "constant-like";
        }
        return "unknown";
    }

    private boolean isConstantLikeValue(long value) {
        if (value == 0L) {
            return false;
        }
        if (value < 0x10000L) {
            return true;
        }
        if (value >= 0x10000L && value < 0x200000L) {
            return true;
        }
        if ((value & 0xFFFF0000L) == 0x00120000L || (value & 0xFFFF0000L) == 0x00170000L) {
            return true;
        }
        return false;
    }

    private String classifyConstantLike(long value) {
        if (isConstantLikeValue(value)) {
            return "constant-like";
        }
        return "unknown";
    }

    private String getAddressType(Address address) {
        if (address == null) {
            return "unknown";
        }
        Function function = getFunctionContaining(address);
        return function != null ? "code" : "data";
    }

    private String getSymbolName(Address address) {
        if (address == null) {
            return "<none>";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(address);
        return symbol != null ? symbol.getName() : "<none>";
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

    private class Graph {
        public final Map<Integer, Node> nodes = new HashMap<Integer, Node>();
        public final Map<Address, Node> nodesByAddress = new HashMap<Address, Node>();
        public final List<GraphEdge> edges = new ArrayList<GraphEdge>();
        public final List<FieldPattern> patterns = new ArrayList<FieldPattern>();
        private int nextNodeId = 1;

        public Node addNode(Address address, int depth) {
            Node node = new Node(nextNodeId++, address, depth);
            node.addressType = getAddressType(address);
            nodes.put(node.id, node);
            nodesByAddress.put(address, node);
            return node;
        }

        public void addEdge(Node from, Node to, int offset, long pointerValue, String classification) {
            edges.add(new GraphEdge(from, to, offset, pointerValue, classification));
        }

        public void computePatterns() {
            for (Node node : nodes.values()) {
                FieldPattern pattern = scanFieldPattern(node.address, POINTER_LAYOUT_BYTES);
                node.pointerCount = pattern.countType(FieldType.POINTER);
                node.integerCount = pattern.countType(FieldType.INTEGER);
                node.zeroCount = pattern.countType(FieldType.ZERO);
                node.unknownCount = pattern.countType(FieldType.UNKNOWN);
                node.constantLikeCount = pattern.countType(FieldType.CONSTANT_LIKE);
                node.byteFlagCount = scanByteFlags(node.address, RAW_DUMP_BYTES);
                patterns.add(pattern);
            }
        }
    }

    private class Node {
        public final int id;
        public final Address address;
        public final int depth;
        public String addressType;
        public int pointerCount;
        public int integerCount;
        public int zeroCount;
        public int unknownCount;
        public int constantLikeCount;
        public int byteFlagCount;

        public Node(int id, Address address, int depth) {
            this.id = id;
            this.address = address;
            this.depth = depth;
        }
    }

    private class GraphEdge {
        public final Node from;
        public final Node to;
        public final int offset;
        public final long pointerValue;
        public final String classification;

        public GraphEdge(Node from, Node to, int offset, long pointerValue, String classification) {
            this.from = from;
            this.to = to;
            this.offset = offset;
            this.pointerValue = pointerValue;
            this.classification = classification;
        }
    }

    private class TargetResolution {
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

    private class RecordPointer {
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

    private class FieldPattern {
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

    private class FieldInfo {
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
        UNKNOWN("U"),
        CONSTANT_LIKE("C");

        public final String token;

        FieldType(String token) {
            this.token = token;
        }
    }

    private FieldPattern scanFieldPattern(Address address, int bytes) {
        int pointerSize = currentProgram.getDefaultPointerSize();
        List<FieldInfo> fields = new ArrayList<FieldInfo>();
        for (int offset = 0; offset < bytes; offset += pointerSize) {
            Address probe = address.add(offset);
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
                if (pointerTarget != null && isAddressInMemory(pointerTarget)) {
                    classification = classifyPointerTarget(value, pointerTarget);
                    type = FieldType.POINTER;
                }
                else if (isConstantLikeValue(value)) {
                    classification = "constant-like";
                    type = FieldType.CONSTANT_LIKE;
                }
                else {
                    type = FieldType.INTEGER;
                }
            }
            fields.add(new FieldInfo(offset, value, type, pointerTarget, classification));
        }
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < fields.size(); i++) {
            if (i > 0) builder.append(",");
            builder.append(fields.get(i).type.token);
        }
        return new FieldPattern(address, fields, builder.toString());
    }

    private int scanByteFlags(Address address, int bytes) {
        int count = 0;
        byte[] raw = new byte[bytes];
        try {
            currentProgram.getMemory().getBytes(address, raw, 0, raw.length);
        }
        catch (MemoryAccessException e) {
            return 0;
        }
        for (int i = 0; i < raw.length; i++) {
            int value = raw[i] & 0xFF;
            if (value == 0) {
                continue;
            }
            if (value <= 0x0F || value >= 0xF0) {
                count++;
            }
        }
        return count;
    }

    private String addressToString(Address address) {
        return address == null ? "<none>" : address.toString();
    }

    private static class TargetSpec {
        public final String name;
        public final long rva;

        public TargetSpec(String name, long rva) {
            this.name = name;
            this.rva = rva;
        }
    }
}
