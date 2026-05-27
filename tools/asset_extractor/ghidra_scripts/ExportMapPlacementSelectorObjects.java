// Export selector-object memory context for Kingdom Adventures map placement.
//
// This script is intended to run inside Ghidra with Java scripting enabled.
// It resolves two selector object addresses observed in FUN_01504134 and exports
// raw memory context, xrefs, nearby symbols, and pointer metadata candidates.

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryAccessException;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.Symbol;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class ExportMapPlacementSelectorObjects extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/map-placement-selector-objects";

    private static final TargetSpec[] TARGETS = new TargetSpec[] {
        new TargetSpec("SELECTOR_0x2A08B18", 0x2A08B18L),
        new TargetSpec("SELECTOR_0x2A08B6C", 0x2A08B6CL)
    };

    private static final int CONTEXT_BYTES = 256;
    private static final int POINTER_SCAN_SIZE = 256;

    @Override
    public void run() throws Exception {
        File outDir = new File(DEFAULT_OUTPUT_DIR).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create export directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Export directory: " + outDir.getAbsolutePath());

        Address imageBase = currentProgram.getImageBase();
        println("[INFO] Current program image base: " + imageBase.toString());

        File resolutionFile = new File(outDir, "seed_resolution.tsv");
        File selectorFile = new File(outDir, "selector_objects.tsv");
        File xrefFile = new File(outDir, "selector_xrefs.tsv");
        File symbolFile = new File(outDir, "nearby_data_symbols.tsv");
        File metadataFile = new File(outDir, "metadata_candidates.tsv");

        List<TargetResolution> resolutions = resolveTargets(imageBase);
        writeResolutionReport(resolutionFile, resolutions, imageBase);
        writeSelectorObjects(selectorFile, resolutions);
        writeSelectorXrefs(xrefFile, resolutions);
        writeNearbyDataSymbols(symbolFile, resolutions);
        writeMetadataCandidates(metadataFile, resolutions);
        writeSelectorMemoryFiles(outDir, resolutions);

        println("[DONE] Export complete. Targets resolved: " + resolutions.size());
    }

    private List<TargetResolution> resolveTargets(Address imageBase) {
        List<TargetResolution> resolutions = new ArrayList<TargetResolution>();
        for (TargetSpec spec : TARGETS) {
            resolutions.add(resolveTarget(spec, imageBase));
        }
        return resolutions;
    }

    private TargetResolution resolveTarget(TargetSpec spec, Address imageBase) {
        Address directAddress = toAddr(String.format("0x%08X", spec.rva));
        boolean directInMemory = isAddressInMemory(directAddress);
        boolean directInstructionExists = directInMemory && currentProgram.getListing().getInstructionAt(directAddress) != null;
        Function directFunction = directInstructionExists ? getFunctionContaining(directAddress) : getFunctionContaining(directAddress);
        if (directFunction == null && directInstructionExists) {
            directFunction = getFunctionAt(directAddress);
        }

        Address imageBaseAddress = null;
        boolean imageBaseInMemory = false;
        boolean imageBaseInstructionExists = false;
        Function imageBaseFunction = null;
        try {
            imageBaseAddress = imageBase.add(spec.rva);
            imageBaseInMemory = isAddressInMemory(imageBaseAddress);
            imageBaseInstructionExists = imageBaseInMemory && currentProgram.getListing().getInstructionAt(imageBaseAddress) != null;
            if (imageBaseInstructionExists) {
                imageBaseFunction = getFunctionContaining(imageBaseAddress);
                if (imageBaseFunction == null) {
                    imageBaseFunction = getFunctionAt(imageBaseAddress);
                }
            }
        }
        catch (AddressOutOfBoundsException e) {
            imageBaseAddress = null;
            imageBaseInMemory = false;
            imageBaseInstructionExists = false;
        }

        Address chosenAddress = null;
        Function chosenFunction = null;
        String resolutionMethod = "none";
        if (directInstructionExists) {
            chosenAddress = directAddress;
            chosenFunction = directFunction;
            resolutionMethod = "direct";
        }
        else if (imageBaseInstructionExists) {
            chosenAddress = imageBaseAddress;
            chosenFunction = imageBaseFunction;
            resolutionMethod = "image_base";
        }

        boolean resolved = chosenAddress != null && currentProgram.getListing().getInstructionAt(chosenAddress) != null;
        String status = resolved ? "confirmed" : "failed";
        String note = resolved ? "" : "Address resolved but no instruction function at target";

        println("[TARGET] " + spec.name + " direct=" + directAddress + " directInMem=" + directInMemory + " directInstr=" + directInstructionExists + " imgAddr=" + (imageBaseAddress != null ? imageBaseAddress.toString() : "<invalid>") + " imgInMem=" + imageBaseInMemory + " imgInstr=" + imageBaseInstructionExists + " chosen=" + (chosenAddress != null ? chosenAddress.toString() : "<none>") + " status=" + status);

        return new TargetResolution(
            spec.name,
            spec.rva,
            imageBase,
            directAddress,
            directInMemory,
            directInstructionExists,
            directFunction,
            imageBaseAddress,
            imageBaseInMemory,
            imageBaseInstructionExists,
            imageBaseFunction,
            chosenAddress,
            chosenFunction,
            resolutionMethod,
            status,
            note
        );
    }

    private boolean isAddressInMemory(Address addr) {
        return addr != null && currentProgram.getMemory().contains(addr);
    }

    private void writeSelectorObjects(File outFile, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|chosen_address|chosen_symbol|direct_address|image_base_address|status|note");
        for (TargetResolution res : resolutions) {
            String chosenSymbol = getSymbolName(res.getResolvedAddress());
            lines.add(res.targetName + "|" + res.getResolvedAddressString() + "|" + chosenSymbol + "|" + addressToString(res.directAddress) + "|" + addressToString(res.imageBaseAddress) + "|" + res.status + "|" + sanitizeString(res.note));
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSelectorXrefs(File outFile, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|target_address|from_address|from_function|reference_type");
        for (TargetResolution res : resolutions) {
            Address target = res.getResolvedAddress();
            if (target == null) {
                target = res.directAddress;
            }
            if (target == null) {
                continue;
            }

            ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(target);
            if (refs == null || !refs.hasNext()) {
                lines.add(res.targetName + "|" + target + "|<none>|<none>|<none>");
                continue;
            }

            while (refs.hasNext()) {
                Reference ref = refs.next();
                Address from = ref.getFromAddress();
                Function fromFunc = getFunctionContaining(from);
                String fromFunction = fromFunc != null ? fromFunc.getName() + "@" + fromFunc.getEntryPoint() : "<none>";
                lines.add(res.targetName + "|" + target + "|" + from + "|" + fromFunction + "|" + ref.getReferenceType().getName());
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeNearbyDataSymbols(File outFile, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|address|symbol_name|data_type|data_value");
        Listing listing = currentProgram.getListing();
        for (TargetResolution res : resolutions) {
            Address regionCenter = res.getResolvedAddress();
            if (regionCenter == null) {
                regionCenter = res.directAddress;
            }
            if (regionCenter == null) {
                continue;
            }

            Address start = getBoundedAddress(regionCenter, -CONTEXT_BYTES / 2);
            Address end = getBoundedAddress(regionCenter, CONTEXT_BYTES / 2);
            for (Address address = start; address.compareTo(end) <= 0; address = address.add(1)) {
                Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(address);
                Data data = listing.getDataAt(address);
                if (symbol == null && data == null) {
                    continue;
                }
                String symbolName = symbol != null ? symbol.getName() : "<none>";
                String dataType = data != null ? data.getDataType().getName() : "<none>";
                String dataValue = data != null && data.getValue() != null ? sanitizeString(data.getValue().toString()) : "<none>";
                lines.add(res.targetName + "|" + address + "|" + symbolName + "|" + dataType + "|" + dataValue);
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeMetadataCandidates(File outFile, List<TargetResolution> resolutions) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|base_address|offset|pointer_value|pointer_address|pointer_symbol|pointer_data_type|notes");
        Memory memory = currentProgram.getMemory();
        int pointerSize = currentProgram.getDefaultPointerSize();
        for (TargetResolution res : resolutions) {
            Address baseAddress = res.getResolvedAddress();
            if (baseAddress == null) {
                baseAddress = res.directAddress;
            }
            if (baseAddress == null) {
                continue;
            }

            Address regionStart = getBoundedAddress(baseAddress, -POINTER_SCAN_SIZE / 2);
            for (int offset = 0; offset + pointerSize <= POINTER_SCAN_SIZE; offset += pointerSize) {
                Address probe = regionStart.add(offset);
                byte[] bytes = new byte[pointerSize];
                try {
                    memory.getBytes(probe, bytes, 0, pointerSize);
                }
                catch (MemoryAccessException e) {
                    continue;
                }
                long ptrValue = toUnsignedLong(bytes);
                if (ptrValue == 0L) {
                    continue;
                }
                Address pointerAddress = toAddr(String.format("0x%X", ptrValue));
                boolean pointerInMemory = isAddressInMemory(pointerAddress);
                String pointerSymbol = pointerInMemory ? getSymbolName(pointerAddress) : "<none>";
                Data pointerData = pointerInMemory ? currentProgram.getListing().getDataAt(pointerAddress) : null;
                String pointerType = pointerData != null ? pointerData.getDataType().getName() : "<none>";
                String notes = pointerInMemory ? "resolved" : "unresolved";
                lines.add(res.targetName + "|" + baseAddress + "|" + String.format("0x%X", offset) + "|" + String.format("0x%X", ptrValue) + "|" + (pointerInMemory ? pointerAddress.toString() : "<none>") + "|" + pointerSymbol + "|" + pointerType + "|" + notes);
            }
        }
        writeFile(outFile, join(lines, "\n") + "\n");
    }

    private void writeSelectorMemoryFiles(File outDir, List<TargetResolution> resolutions) throws IOException {
        Memory memory = currentProgram.getMemory();
        for (TargetResolution res : resolutions) {
            Address address = res.getResolvedAddress();
            if (address == null) {
                address = res.directAddress;
            }
            if (address == null) {
                continue;
            }
            String fileName = "selector_memory_" + res.targetName + "_" + address.toString().replace(':', '_') + ".txt";
            File outFile = new File(outDir, fileName);
            StringBuilder builder = new StringBuilder();
            builder.append("Selector: ").append(res.targetName).append("\n");
            builder.append("Resolved address: ").append(address).append("\n");
            builder.append("Resolution method: ").append(res.resolutionMethod).append("\n");
            builder.append("Status: ").append(res.status).append("\n");
            builder.append("Note: ").append(res.note).append("\n\n");
            builder.append(dumpMemoryRegion(address, CONTEXT_BYTES, memory));
            builder.append("\n\nPointer candidates around selector:\n");
            builder.append(dumpPointerCandidates(address, POINTER_SCAN_SIZE, memory));
            writeFile(outFile, builder.toString());
        }
    }

    private String dumpMemoryRegion(Address center, int totalBytes, Memory memory) {
        StringBuilder builder = new StringBuilder();
        int half = totalBytes / 2;
        Address start = getBoundedAddress(center, -half);
        Address end = getBoundedAddress(center, half - 1);
        byte[] raw = new byte[16];
        Address lineAddress = start;
        while (lineAddress.compareTo(end) <= 0) {
            int remaining = (int) Math.min(raw.length, end.subtract(lineAddress) + 1);
            StringBuilder hex = new StringBuilder();
            StringBuilder ascii = new StringBuilder();
            try {
                memory.getBytes(lineAddress, raw, 0, remaining);
                for (int i = 0; i < remaining; i++) {
                    byte b = raw[i];
                    hex.append(String.format("%02X ", b));
                    ascii.append((b >= 0x20 && b < 0x7F) ? (char) b : '.');
                }
            }
            catch (MemoryAccessException e) {
                for (int i = 0; i < remaining; i++) {
                    hex.append("?? ");
                    ascii.append('.');
                }
            }
            String marker = lineAddress.equals(center) ? " <<< selector" : "";
            builder.append(String.format("%s  %-48s  %s%s\n", lineAddress, hex.toString().trim(), ascii.toString(), marker));
            lineAddress = lineAddress.add(16);
        }
        return builder.toString();
    }

    private String dumpPointerCandidates(Address center, int scanSize, Memory memory) {
        StringBuilder builder = new StringBuilder();
        int pointerSize = currentProgram.getDefaultPointerSize();
        Address regionStart = getBoundedAddress(center, -scanSize / 2);
        for (int offset = 0; offset + pointerSize <= scanSize; offset += pointerSize) {
            Address probe = regionStart.add(offset);
            byte[] bytes = new byte[pointerSize];
            try {
                memory.getBytes(probe, bytes, 0, pointerSize);
            }
            catch (MemoryAccessException e) {
                continue;
            }
            long ptrValue = toUnsignedLong(bytes);
            if (ptrValue == 0L) {
                continue;
            }
            Address pointerAddress = toAddr(String.format("0x%X", ptrValue));
            String pointerSymbol = "<none>";
            String pointerType = "<none>";
            if (isAddressInMemory(pointerAddress)) {
                pointerSymbol = getSymbolName(pointerAddress);
                Data data = currentProgram.getListing().getDataAt(pointerAddress);
                pointerType = data != null ? data.getDataType().getName() : "<none>";
            }
            builder.append(String.format("offset=0x%X pointer=0x%X resolved=%s symbol=%s type=%s\n",
                offset,
                ptrValue,
                isAddressInMemory(pointerAddress) ? pointerAddress.toString() : "<unmapped>",
                pointerSymbol,
                pointerType));
        }
        return builder.toString();
    }

    private Address getBoundedAddress(Address base, long delta) {
        Address candidate;
        try {
            candidate = base.add(delta);
        }
        catch (AddressOutOfBoundsException e) {
            Memory memory = currentProgram.getMemory();
            if (delta < 0) {
                candidate = memory.getMinAddress();
            }
            else {
                candidate = memory.getMaxAddress();
            }
        }
        Memory memory = currentProgram.getMemory();
        if (candidate.compareTo(memory.getMinAddress()) < 0) {
            candidate = memory.getMinAddress();
        }
        if (candidate.compareTo(memory.getMaxAddress()) > 0) {
            candidate = memory.getMaxAddress();
        }
        return candidate;
    }

    private long toUnsignedLong(byte[] bytes) {
        long value = 0L;
        for (int i = 0; i < bytes.length; i++) {
            value |= ((long) bytes[i] & 0xFFL) << (8 * i);
        }
        return value;
    }

    private String getSymbolName(Address address) {
        if (address == null) {
            return "<none>";
        }
        Symbol symbol = currentProgram.getSymbolTable().getPrimarySymbol(address);
        if (symbol != null) {
            return symbol.getName();
        }
        return "<none>";
    }

    private void writeResolutionReport(File resolutionFile, List<TargetResolution> resolutions, Address imageBase) throws IOException {
        List<String> lines = new ArrayList<String>();
        lines.add("target_name|requested_rva|program_image_base|direct_address|direct_in_memory|direct_instruction|direct_function|image_base_address|image_base_in_memory|image_base_instruction|image_base_function|chosen_address|chosen_function|resolution_method|status|note");
        for (TargetResolution res : resolutions) {
            lines.add(res.toTsvLine());
        }
        writeFile(resolutionFile, join(lines, "\n") + "\n");
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

    private static String sanitizeString(String input) {
        if (input == null) {
            return "";
        }
        return input.replaceAll("[\r\n\t|]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String addressToString(Address address) {
        return address != null ? address.toString() : "<none>";
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
        public final String targetName;
        public final long requestedRva;
        public final Address programImageBase;
        public final Address directAddress;
        public final boolean directInMemory;
        public final boolean directInstructionExists;
        public final Function directFunction;
        public final Address imageBaseAddress;
        public final boolean imageBaseInMemory;
        public final boolean imageBaseInstructionExists;
        public final Function imageBaseFunction;
        public final Address chosenAddress;
        public final Function chosenFunction;
        public final String resolutionMethod;
        public final String status;
        public final String note;

        public TargetResolution(
            String targetName,
            long requestedRva,
            Address programImageBase,
            Address directAddress,
            boolean directInMemory,
            boolean directInstructionExists,
            Function directFunction,
            Address imageBaseAddress,
            boolean imageBaseInMemory,
            boolean imageBaseInstructionExists,
            Function imageBaseFunction,
            Address chosenAddress,
            Function chosenFunction,
            String resolutionMethod,
            String status,
            String note
        ) {
            this.targetName = targetName;
            this.requestedRva = requestedRva;
            this.programImageBase = programImageBase;
            this.directAddress = directAddress;
            this.directInMemory = directInMemory;
            this.directInstructionExists = directInstructionExists;
            this.directFunction = directFunction;
            this.imageBaseAddress = imageBaseAddress;
            this.imageBaseInMemory = imageBaseInMemory;
            this.imageBaseInstructionExists = imageBaseInstructionExists;
            this.imageBaseFunction = imageBaseFunction;
            this.chosenAddress = chosenAddress;
            this.chosenFunction = chosenFunction;
            this.resolutionMethod = resolutionMethod;
            this.status = status;
            this.note = note;
        }

        public Address getResolvedAddress() {
            return chosenAddress != null ? chosenAddress : directAddress != null ? directAddress : imageBaseAddress;
        }

        public String getResolvedAddressString() {
            Address address = getResolvedAddress();
            return address != null ? address.toString() : "<none>";
        }

        public String toTsvLine() {
            return targetName + "|0x" + Long.toHexString(requestedRva).toUpperCase() +
                "|" + addressToString(programImageBase) +
                "|" + addressToString(directAddress) +
                "|" + directInMemory +
                "|" + directInstructionExists +
                "|" + functionInfo(directFunction) +
                "|" + addressToString(imageBaseAddress) +
                "|" + imageBaseInMemory +
                "|" + imageBaseInstructionExists +
                "|" + functionInfo(imageBaseFunction) +
                "|" + addressToString(getResolvedAddress()) +
                "|" + functionInfo(chosenFunction) +
                "|" + resolutionMethod +
                "|" + status +
                "|" + sanitizeString(note);
        }

        private String functionInfo(Function function) {
            if (function == null) {
                return "<none>";
            }
            return function.getName() + "@" + function.getEntryPoint().toString();
        }
    }
}
