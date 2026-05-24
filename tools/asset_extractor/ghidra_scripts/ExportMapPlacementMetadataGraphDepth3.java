// Metadata descriptor graph export for Kingdom Adventures map placement analysis.
// This Ghidra script performs a bounded depth-3 traversal from selected 02B5.. metadata
// descriptor tables and exports the discovered graph, layout summaries, semantic leaf
// candidates, and raw dumps for every visited node.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
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

public class ExportMapPlacementMetadataGraphDepth3 extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-metadata-graph-depth3";

    private static final TargetSpec[] ROOT_SEEDS = new TargetSpec[] {
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

    private static final int GRAPH_DEPTH = 3;
    private static final int MAX_CHILDREN_PER_NODE = 8;
    private static final int MAX_TOTAL_NODES = 300;
    private static final int POINTER_LAYOUT_BYTES = 256;
    private static final int RAW_DUMP_BYTES = 256;

    @Override
    public void run() throws Exception {
        println("[START] ExportMapPlacementMetadataGraphDepth3 starting...");
        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        println("[INFO] Desired output directory: " + DEFAULT_OUTPUT_DIR);
        println("[INFO] Absolute output directory: " + outDir.getAbsolutePath());
        if (outDir.exists() && !outDir.isDirectory()) {
            throw new IOException("Output path exists but is not a directory: " + outDir.getAbsolutePath());
        }
        if (!outDir.exists()) {
            println("[INFO] Output directory does not exist, creating...");
            if (!outDir.mkdirs()) {
                throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
            }
            println("[INFO] Created export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory ready: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File rootsFile = new File(outDir, "metadata_graph_roots.tsv");
        File nodesFile = new File(outDir, "metadata_graph_nodes.tsv");
        File edgesFile = new File(outDir, "metadata_graph_edges.tsv");
        File layoutsFile = new File(outDir, "metadata_graph_layouts.tsv");
        File integerFieldsFile = new File(outDir, "metadata_graph_integer_fields.tsv");
        File byteFlagsFile = new File(outDir, "metadata_graph_byte_flags.tsv");
        File similarityFile = new File(outDir, "metadata_graph_similarity.tsv");
        File leafCandidatesFile = new File(outDir, "metadata_graph_leaf_candidates.tsv");
        File notesFile = new File(outDir, "metadata_graph_semantic_notes.md");
        File rawIndexFile = new File(outDir, "metadata_graph_raw_memory_index.tsv");

        List<TargetResolution> rootResolutions = resolveRoots(imageBase);
        println("[INFO] Seed count: " + ROOT_SEEDS.length);
        println("[INFO] Resolved seed count: " + rootResolutions.size());
        int confirmedRoots = 0;
        for (TargetResolution root : rootResolutions) {
            if ("confirmed".equals(root.status)) {
                confirmedRoots++;
            }
        }
        println("[INFO] Confirmed root addresses: " + confirmedRoots);

        Set<Address> rootAddresses = collectAddresses(rootResolutions);
        println("[INFO] Resolved root addresses in memory: " + rootAddresses.size());
        if (rootAddresses.isEmpty()) {
            throw new IllegalStateException("No valid root addresses were resolved. Aborting export.");
        }

        Graph graph = traverseGraph(rootAddresses);
        println("[INFO] Graph traversal complete. node count=" + graph.nodes.size() + " edge count=" + graph.edges.size());
        if (graph.nodes.isEmpty()) {
            throw new IllegalStateException("Graph traversal yielded zero nodes. Aborting export.");
        }

        println("[INFO] Writing output files...");
        writeRoots(rootsFile, rootResolutions);
        println("[INFO] Wrote " + rootsFile.getName());
        writeNodes(nodesFile, graph.nodes);
        println("[INFO] Wrote " + nodesFile.getName());
        writeEdges(edgesFile, graph.edges);
        println("[INFO] Wrote " + edgesFile.getName());
        writeLayouts(layoutsFile, graph.patterns);
        println("[INFO] Wrote " + layoutsFile.getName());
        writeIntegerFields(integerFieldsFile, graph.patterns);
        println("[INFO] Wrote " + integerFieldsFile.getName());
        writeByteFlags(byteFlagsFile, graph.nodes);
        println("[INFO] Wrote " + byteFlagsFile.getName());
        writeSimilarity(similarityFile, graph.patterns);
        println("[INFO] Wrote " + similarityFile.getName());
        writeLeafCandidates(leafCandidatesFile, graph.nodes);
        println("[INFO] Wrote " + leafCandidatesFile.getName());
        writeRawMemoryDumps(outDir, rawIndexFile, graph.nodes.values());
        println("[INFO] Wrote " + rawIndexFile.getName() + " and raw dumps");
        writeNotes(notesFile, rootResolutions, graph);
        println("[INFO] Wrote " + notesFile.getName());

        println("[DONE] Metadata graph export complete. roots=" + rootAddresses.size() + " nodes=" + graph.nodes.size() + " edges=" + graph.edges.size());
    }

    private List<TargetResolution> resolveRoots(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : ROOT_SEEDS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address address = toAddr(String.format("0x%08X", spec.rva));
        boolean inMemory = isAddressInMemory(address);
        String status = inMemory ? "confirmed" : "failed";
        String note = inMemory ? "Mapped metadata descriptor root." : "Target address not mapped.";
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
            String targetClass = classifyPointerTarget(target);
            pointers.add(new RecordPointer(address, offset, value, target, targetClass));
        }
        return pointers;
    }

    private void writeRoots(File file, List<TargetResolution> roots) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("root_name|address|symbol|status|note");
        for (TargetResolution root : roots) {
            lines.add(root.name + "|" + addressToString(root.address) + "|" + getSymbolName(root.address) + "|" + root.status + "|" + sanitizeString(root.note));
        }
        writeFile(file, join(lines, "\n") + "\n");
    }

    private void writeNodes(File file, Map<Integer, Node> nodes) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("node_id|address|depth|address_type|symbol|pointer_count|integer_count|zero_count|unknown_count|scalar_count|byte_flag_count");
        List<Node> sorted = new ArrayList<Node>(nodes.values());
        Collections.sort(sorted, new Comparator<Node>() {
            @Override
            public int compare(Node a, Node b) {
                return Integer.compare(a.id, b.id);
            }
        });
        for (Node node : sorted) {
            lines.add(node.id + "|" + node.address + "|" + node.depth + "|" + node.addressType + "|" + getSymbolName(node.address) + "|" + node.pointerCount + "|" + node.integerCount + "|" + node.zeroCount + "|" + node.unknownCount + "|" + (node.integerCount + node.unknownCount) + "|" + node.byteFlagCount);
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
            if (node.pointerCount == 0 || node.integerCount > 0 || node.byteFlagCount > 0 || node.depth == GRAPH_DEPTH) {
                candidates.add(node);
            }
        }
        Collections.sort(candidates, new Comparator<Node>() {
            @Override
            public int compare(Node a, Node b) {
                int scoreA = a.integerCount * 100 + a.byteFlagCount * 10 + (a.pointerCount == 0 ? 50 : 0) + a.depth;
                int scoreB = b.integerCount * 100 + b.byteFlagCount * 10 + (b.pointerCount == 0 ? 50 : 0) + b.depth;
                return Integer.compare(scoreB, scoreA);
            }
        });
        List<String> lines = new ArrayList<String>();
        lines.add("rank|node_id|address|depth|pointer_count|integer_count|byte_flag_count|score|reason");
        int rank = 1;
        for (Node node : candidates) {
            if (rank > 10) {
                break;
            }
            int score = node.integerCount * 100 + node.byteFlagCount * 10 + (node.pointerCount == 0 ? 50 : 0) + node.depth;
            String reason = node.pointerCount == 0 ? "pointer-only leaf" : (node.integerCount > 0 ? "scalar values present" : "depth limit or byte flags");
            lines.add(rank + "|" + node.id + "|" + node.address + "|" + node.depth + "|" + node.pointerCount + "|" + node.integerCount + "|" + node.byteFlagCount + "|" + score + "|" + reason);
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
        builder.append("# Metadata descriptor graph depth-3 analysis\n\n");
        builder.append("This export performs bounded graph traversal from the selected 02B5.. descriptor tables.\n\n");
        builder.append("## Traversal configuration\n\n");
        builder.append("- root nodes: selected 02B5.. metadata descriptor targets.\n");
        builder.append("- graph depth: ").append(GRAPH_DEPTH).append(".\n");
        builder.append("- max children per node: ").append(MAX_CHILDREN_PER_NODE).append(".\n");
        builder.append("- max total nodes: ").append(MAX_TOTAL_NODES).append(".\n");
        builder.append("- pointer layout scan: ").append(POINTER_LAYOUT_BYTES).append(" bytes.\n");
        builder.append("- raw dump size: ").append(RAW_DUMP_BYTES).append(" bytes per node.\n\n");
        builder.append("## Outputs\n\n");
        builder.append("- metadata_graph_roots.tsv\n");
        builder.append("- metadata_graph_nodes.tsv\n");
        builder.append("- metadata_graph_edges.tsv\n");
        builder.append("- metadata_graph_layouts.tsv\n");
        builder.append("- metadata_graph_integer_fields.tsv\n");
        builder.append("- metadata_graph_byte_flags.tsv\n");
        builder.append("- metadata_graph_similarity.tsv\n");
        builder.append("- metadata_graph_leaf_candidates.tsv\n");
        builder.append("- metadata_graph_semantic_notes.md\n");
        builder.append("- raw_*.bin dumps for each explored node.\n\n");
        builder.append("## Analysis expectations\n\n");
        builder.append("- the graph should expose whether the 02B5.. tables lead into deeper descriptor objects or end at scalar metadata records.\n");
        builder.append("- leaf candidates are scored by scalar content, byte-flag density, pointer termination, and traversal depth.\n");
        builder.append("- use the leaf candidate list to prioritize nodes that likely contain enum-like IDs, state values, orientation flags, or buildability metadata.\n");
        builder.append("\n## Phase 2.12 goals\n\n");
        builder.append("- confirm whether depth 1-3 exposes small integers, enum-like fields, byte flags, counts, category IDs, state values, and orientation/connection indicators.\n");
        builder.append("- determine which metadata code family leads to the most semantic-looking records.\n");
        builder.append("- if the graph remains pointer-only at depth 3, the semantic payload is likely at least one layer deeper or encoded through a second pointer-table family.\n");
        writeFile(file, builder.toString());
    }

    private String classifyPointerTarget(Address pointerAddress) {
        if (pointerAddress == null || !isAddressInMemory(pointerAddress)) {
            return "unknown";
        }
        Function function = getFunctionContaining(pointerAddress);
        if (function != null) {
            return "code";
        }
        Data data = currentProgram.getListing().getDataAt(pointerAddress);
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(pointerAddress);
        if (data != null && data.getValue() instanceof String) {
            return "string";
        }
        if (symbol != null) {
            String name = symbol.getName();
            if (name.startsWith("PTR_DAT_") || name.startsWith("DAT_") || name.toUpperCase().contains("META")) {
                return "metadata";
            }
            return "data";
        }
        if (data != null) {
            return "data";
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
        println("[WRITE] Writing file: " + file.getAbsolutePath());
        BufferedWriter writer = new BufferedWriter(new FileWriter(file));
        writer.write(content);
        writer.close();
        if (!file.exists()) {
            throw new IOException("File write failed, file does not exist after writing: " + file.getAbsolutePath());
        }
        println("[WRITE] Successfully wrote file: " + file.getAbsolutePath());
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
            GraphEdge edge = new GraphEdge(from, to, offset, pointerValue, classification);
            edges.add(edge);
        }

        public void computePatterns() {
            for (Node node : nodes.values()) {
                FieldPattern pattern = scanFieldPattern(node.address, POINTER_LAYOUT_BYTES);
                node.pointerCount = pattern.countType(FieldType.POINTER);
                node.integerCount = pattern.countType(FieldType.INTEGER);
                node.zeroCount = pattern.countType(FieldType.ZERO);
                node.unknownCount = pattern.countType(FieldType.UNKNOWN);
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
        public final String note;

        public TargetResolution(String name, long rva, Address address, String status, String note) {
            this.name = name;
            this.rva = rva;
            this.address = address;
            this.status = status;
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
        UNKNOWN("U");

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
                    classification = classifyPointerTarget(pointerTarget);
                    type = FieldType.POINTER;
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
