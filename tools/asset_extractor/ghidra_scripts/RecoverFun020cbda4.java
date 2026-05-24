// Recover the true implementation body for FUN_020cbda4 in Kingdom Adventures.
// This script is intended to run inside Ghidra with Java scripting enabled.
// It exports a recovery report, caller list, nearby function summary, a wide disassembly
// window, and decompiled C for nearby functions around 0x020cbda4.

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressOutOfBoundsException;
import ghidra.program.model.listing.CodeUnit;
import ghidra.program.model.listing.CodeUnitIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.Listing;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceManager;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class RecoverFun020cbda4 extends GhidraScript {

    private static final String DEFAULT_OUTPUT_DIR =
        "C:/Users/anisb/OneDrive/Desktop/replit kingdom adventures - Copy/KA-Website/Reverse engineering/exports/active/recover-fun-020cbda4";
    private static final String TARGET_ADDRESS = "0x020cbda4";
    private static final long WINDOW_BYTES = 0x800;
    private static final int DECOMP_TIMEOUT_SECONDS = 120;

    @Override
    public void run() throws Exception {
        String exportDir = askString("Recovery export directory", "Output folder for FUN_020cbda4 recovery data", DEFAULT_OUTPUT_DIR);
        if (exportDir == null || exportDir.trim().isEmpty()) {
            exportDir = DEFAULT_OUTPUT_DIR;
        }
        File outDir = new File(exportDir).getAbsoluteFile();
        if (!outDir.exists() && !outDir.mkdirs()) {
            throw new IOException("Unable to create output directory: " + outDir.getAbsolutePath());
        }
        println("[INFO] Output directory: " + outDir.getAbsolutePath());

        Address target = toAddr(TARGET_ADDRESS);
        Listing listing = currentProgram.getListing();

        Instruction targetInstruction = listing.getInstructionAt(target);
        if (targetInstruction == null) {
            println("[WARN] No instruction at target address " + target + ". Forcing disassembly...");
            boolean ok = disassemble(target);
            println("[INFO] disassemble(" + target + ") = " + ok);
            targetInstruction = listing.getInstructionAt(target);
        }

        Function targetFunction = getFunctionAt(target);
        Function containingFunction = getFunctionContaining(target);
        if (targetFunction == null && containingFunction != null) {
            println("[INFO] Target is inside function " + containingFunction.getName() + " @ " + containingFunction.getEntryPoint());
        }
        if (targetFunction == null) {
            try {
                Function created = createFunction(target, "RECOVER_FUN_020cbda4");
                println("[INFO] Created function at target: " + formatFunction(created));
                targetFunction = created;
            } catch (Exception e) {
                println("[WARN] Unable to create function at " + target + ": " + e.getMessage());
            }
        }

        writeSeedResolution(new File(outDir, "seed_resolution.tsv"), target, targetInstruction, targetFunction, containingFunction);
        writeCallers(new File(outDir, "callers_to_020cbda4.tsv"), target);
        List<Function> nearbyFunctions = collectNearbyFunctions(target, WINDOW_BYTES);
        writeNearbyFunctions(new File(outDir, "nearby_functions.tsv"), nearbyFunctions);
        writeWideDisasm(new File(outDir, "wide_disasm_020cbda4.s"), target);
        writeDecompiledFunctions(new File(outDir, "decompiled_nearby_functions.c"), nearbyFunctions);

        println("[DONE] Recovery export complete.");
    }

    private void writeSeedResolution(File file, Address target, Instruction instr, Function targetFunction, Function containingFunction) throws IOException {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            writer.write("seed\taddress\tresolved_function\tfunction_entry\tfunction_size\tcontaining_function\tcontains_target\tfirst_instruction\n");
            String functionName = targetFunction == null ? "none" : targetFunction.getName();
            String functionEntry = targetFunction == null ? "none" : targetFunction.getEntryPoint().toString();
            String functionSize = targetFunction == null ? "0" : String.valueOf(targetFunction.getBody().getNumAddresses());
            String containingName = containingFunction == null ? "none" : containingFunction.getName();
            String containsTarget = (containingFunction != null && containingFunction.equals(targetFunction)) ? "yes" : "no";
            String firstInstr = instr == null ? "none" : instr.toString();
            writer.write(String.format("FUN_020cbda4\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
                target,
                functionName,
                functionEntry,
                functionSize,
                containingName,
                containsTarget,
                firstInstr.replaceAll("\t", " ")));
        }
    }

    private void writeCallers(File file, Address target) throws IOException {
        ReferenceManager refMgr = currentProgram.getReferenceManager();
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            writer.write("caller_address\tcaller_function\tcaller_function_entry\treference_type\toperand_index\n");
            for (Reference ref : refMgr.getReferencesTo(target)) {
                Address from = ref.getFromAddress();
                Function caller = getFunctionContaining(from);
                String callerName = caller == null ? "none" : caller.getName();
                String callerEntry = caller == null ? "none" : caller.getEntryPoint().toString();
                writer.write(String.format("%s\t%s\t%s\t%s\t%d\n",
                    from,
                    callerName,
                    callerEntry,
                    ref.getReferenceType().getName(),
                    ref.getOperandIndex()));
            }
        }
    }

    private List<Function> collectNearbyFunctions(Address target, long windowBytes) {
        List<Function> results = new ArrayList<>();
        long halfWindow = windowBytes;
        Address start = safeSubtract(target, halfWindow);
        Address end = safeAdd(target, halfWindow);
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(start, true);
        while (it.hasNext()) {
            Function f = it.next();
            if (f.getEntryPoint().compareTo(end) > 0) {
                break;
            }
            results.add(f);
        }
        if (results.isEmpty()) {
            Function containing = getFunctionContaining(target);
            if (containing != null) {
                results.add(containing);
            }
        }
        return results;
    }

    private void writeNearbyFunctions(File file, List<Function> functions) throws IOException {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            writer.write("function_name\tentry\tend\tbody_size\tcomment\n");
            for (Function f : functions) {
                String comment = f.getBody().getNumAddresses() == 0 ? "empty body" : "";
                writer.write(String.format("%s\t%s\t%s\t%d\t%s\n",
                    f.getName(),
                    f.getEntryPoint(),
                    f.getBody().getMaxAddress(),
                    f.getBody().getNumAddresses(),
                    comment));
            }
        }
    }

    private void writeWideDisasm(File file, Address target) throws IOException {
        Listing listing = currentProgram.getListing();
        Address start = safeSubtract(target, WINDOW_BYTES);
        Address end = safeAdd(target, WINDOW_BYTES);
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            writer.write("; Wide disassembly window around " + target + "\n");
            writer.write("; Range: " + start + " - " + end + "\n\n");
            CodeUnitIterator it = listing.getCodeUnits(start, true);
            while (it.hasNext()) {
                CodeUnit cu = it.next();
                if (cu.getAddress().compareTo(end) > 0) {
                    break;
                }
                String marker = cu.getAddress().equals(target) ? " <== TARGET" : "";
                writer.write(cu.getAddress() + ": " + cu.toString() + marker + "\n");
            }
        }
    }

    private void writeDecompiledFunctions(File file, List<Function> functions) throws IOException {
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
            for (Function f : functions) {
                writer.write("/* Decompiled function: " + f.getName() + " @ " + f.getEntryPoint() + " */\n\n");
                String decomp = decompileFunction(ifc, f);
                writer.write(decomp + "\n\n");
            }
        } finally {
            ifc.dispose();
        }
    }

    private String decompileFunction(DecompInterface ifc, Function f) {
        try {
            DecompileResults results = ifc.decompileFunction(f, DECOMP_TIMEOUT_SECONDS, monitor);
            if (results == null || !results.decompileCompleted()) {
                return "/* Decompile failed or timed out for " + f.getName() + " */";
            }
            String c = results.getDecompiledFunction().getC();
            return c == null ? "/* Decompile produced no C output */" : c;
        } catch (Exception e) {
            return "/* Decompile exception: " + e.getMessage() + " */";
        }
    }

    private Address safeSubtract(Address a, long offset) {
        try {
            return a.subtract(offset);
        } catch (AddressOutOfBoundsException e) {
            return currentProgram.getMinAddress();
        }
    }

    private Address safeAdd(Address a, long offset) {
        try {
            return a.add(offset);
        } catch (AddressOutOfBoundsException e) {
            return currentProgram.getMaxAddress();
        }
    }

    private String formatFunction(Function f) {
        if (f == null) {
            return "none";
        }
        return f.getName() + " @ " + f.getEntryPoint() + " (" + f.getBody().getNumAddresses() + " bytes)";
    }
}
