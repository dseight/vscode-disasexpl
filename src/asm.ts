// Copyright (c) 2015, Matt Godbolt
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

// Following code is a bit differs from Compiler Explorer's version
// to better fit needs of Disassembly Explorer

import { splitLines, expandTabs } from './utils';

export class AsmFilter {
    trim: boolean = true;
    binary: boolean = false;
    commentOnly: boolean = false;
    directives: boolean = true;
    labels: boolean = true;
}

export class AsmSource {
    file: string | undefined;
    line: number;

    constructor(file: string | undefined, line: number) {
        this.file = file;
        this.line = line;
    }
}

export class AsmLine {
    text: string;
    source: AsmSource | undefined;

    constructor(text: string, source: AsmSource | undefined) {
        this.text = text;
        this.source = source;
    }
}

export class BinaryAsmLine extends AsmLine {
    address: number;
    opcodes: string;

    constructor(text: string, source: AsmSource | undefined, address: number, opcodes: string) {
        super(text, source);
        this.address = address;
        this.opcodes = opcodes;
    }
}

export class AsmParser {

    labelDef = /^([.a-z_$@][a-z0-9$_@.]*):/i;

    labelFindNonMips = /[.a-zA-Z_][a-zA-Z0-9$_.]*/g;
    // MIPS labels can start with a $ sign, but other assemblers use $ to mean literal.
    labelFindMips = /[$.a-zA-Z_][a-zA-Z0-9$_.]*/g;
    mipsLabelDefinition = /^\$[a-zA-Z0-9$_.]+:/;
    dataDefn = /^\s*\.(string|asciz|ascii|[1248]?byte|short|word|long|quad|value|zero)/;
    fileFind = /^\s*\.file\s+(\d+)\s+"([^"]+)"(\s+"([^"]+)")?.*/;
    hasOpcodeRe = /^\s*[a-zA-Z]/;
    definesFunction = /^\s*\.type.*,\s*[@%]function$/;
    definesGlobal = /^\s*\.globa?l\s*([.a-zA-Z_][a-zA-Z0-9$_.]*)/;
    indentedLabelDef = /^\s*([.a-zA-Z_$][a-zA-Z0-9$_.]*):/;
    assignmentDef = /^\s*([.a-zA-Z_$][a-zA-Z0-9$_.]+)\s*=/;
    directive = /^\s*\..*$/;
    startAppBlock = /\s*#APP.*/;
    endAppBlock = /\s*#NO_APP.*/;
    startAsmNesting = /\s*# Begin ASM.*/;
    endAsmNesting = /\s*# End ASM.*/;
    cudaBeginDef = /.*\.(entry|func)\s+(?:\([^)]*\)\s*)?([.a-zA-Z_$][a-zA-Z0-9$_.]*)\($/;
    cudaEndDef = /^\s*\)\s*$/;

    asmOpcodeRe = /^\s*([0-9a-f]+):\s*(([0-9a-f][0-9a-f] ?)+)\s*(.*)/;
    lineRe = /^(\/[^:]+):([0-9]+).*/;
    labelRe = /^([0-9a-f]+)\s+<([^>]+)>:$/;
    destRe = /.*\s([0-9a-f]+)\s+<([^>]+)>$/;

    binaryHideFuncRe: RegExp | undefined;
    inNvccDef = false;

    hasOpcode(line: string) {
        // Remove any leading label definition...
        const match = line.match(this.labelDef);
        if (match) {
            line = line.substr(match[0].length);
        }
        // Strip any comments
        line = line.split(/[#;]/, 1)[0];
        // Detect assignment, that's not an opcode...
        if (line.match(this.assignmentDef)) {
            return false;
        }
        return !!line.match(this.hasOpcodeRe);
    }

    filterAsmLine(line: string, filter: AsmFilter) {
        if (!filter.trim) {
            return line;
        }
        const splat = line.split(/\s+/);
        if (splat[0] === "") {
            // An indented line: preserve a two-space indent
            return "  " + splat.slice(1).join(" ");
        } else {
            return splat.join(" ");
        }
    }

    labelFindFor(asmLines: string[]) {
        let isMips = asmLines.some(line => {
            return !!line.match(this.mipsLabelDefinition);
        });
        return isMips ? this.labelFindMips : this.labelFindNonMips;
    }

    findUsedLabels(asmLines: string[], filterDirectives: boolean): Set<string> {
        const labelsUsed = new Set<string>();
        const weakUsages = new Map<string, string[]>();
        const labelFind = this.labelFindFor(asmLines);
        let currentLabel = "";
        let inCustomAssembly = 0;

        // Scan through looking for definite label usages (ones used by opcodes),
        // and ones that are weakly used: that is, their use is conditional on another label.
        // For example:
        // .foo: .string "moo"
        // .baz: .quad .foo
        //       mov eax, .baz
        // In this case, the '.baz' is used by an opcode, and so is strongly used.
        // The '.foo' is weakly used by .baz.
        asmLines.forEach(line => {
            if (line.match(this.startAppBlock) || line.match(this.startAsmNesting)) {
                inCustomAssembly++;
            } else if (line.match(this.endAppBlock) || line.match(this.endAsmNesting)) {
                inCustomAssembly--;
            }

            if (inCustomAssembly > 0) {
                line = this.fixLabelIndentation(line);
            }

            let match = line.match(this.labelDef);
            if (match) {
                currentLabel = match[1];
            }

            match = line.match(this.definesGlobal);
            if (!match) {
                match = line.match(this.cudaBeginDef);
            }
            if (match) {
                labelsUsed.add(match[1]);
            }

            if (!line || line[0] === '.') {
                return;
            }

            match = line.match(labelFind);
            if (!match) {
                return;
            }

            if (!filterDirectives || this.hasOpcode(line) || line.match(this.definesFunction)) {
                // Only count a label as used if it's used by an opcode, or else we're not filtering directives.
                match.forEach(label => labelsUsed.add(label));
            } else if (currentLabel) {
                // If we have a current label, then any subsequent opcode or data definition's labels are refered to
                // weakly by that label.
                const isDataDefinition = !!line.match(this.dataDefn);
                const isOpcode = this.hasOpcode(line);
                if (isDataDefinition || isOpcode) {
                    if (weakUsages.get(currentLabel) === undefined) {
                        weakUsages.set(currentLabel, []);
                    }
                    match.forEach(label => weakUsages.get(currentLabel)!.push(label));
                }
            }
        });

        // Now follow the chains of used labels, marking any weak references they refer
        // to as also used. We iteratively do this until either no new labels are found,
        // or we hit a limit (only here to prevent a pathological case from hanging).
        const MaxLabelIterations = 10;
        for (let iter = 0; iter < MaxLabelIterations; ++iter) {
            let toAdd: string[] = [];

            labelsUsed.forEach(label => {
                let labelWeakUsages = weakUsages.get(label);
                if (labelWeakUsages === undefined) {
                    return;
                }
                labelWeakUsages.forEach(nowused => {
                    if (labelsUsed.has(nowused)) {
                        return;
                    }
                    toAdd.push(nowused);
                });
            });
            if (!toAdd) {
                break;
            }

            toAdd.forEach(label => {
                labelsUsed.add(label);
            });
        }
        return labelsUsed;
    }

    parseFiles(asmLines: string[]): Map<number, string> {
        const files = new Map<number, string>();

        asmLines.forEach(line => {
            const match = line.match(this.fileFind);
            if (match) {
                const lineNum = parseInt(match[1]);
                if (match[4]) {
                    // Clang-style file directive '.file X "dir" "filename"'
                    files.set(lineNum, match[2] + "/" + match[4]);
                } else {
                    files.set(lineNum, match[2]);
                }
            }
        });

        return files;
    }

    processAsm(asm: string, filter: AsmFilter): AsmLine[] {
        if (filter.commentOnly) {
            // Remove any block comments that start and end on a line if we're removing comment-only lines.
            const blockComments = /^\s*\/\*(\*(?!\/)|[^*])*\*\/\s*\r?\n/mg;
            asm = asm.replace(blockComments, "");
        }

        const result: AsmLine[] = [];
        let asmLines = splitLines(asm);

        const labelsUsed = this.findUsedLabels(asmLines, filter.directives);
        const files = this.parseFiles(asmLines);
        let prevLabel: string | undefined = "";

        const commentOnly = /^\s*(((#|@|;|\/\/).*)|(\/\*.*\*\/))$/;
        const sourceTag = /^\s*\.loc\s+(\d+)\s+(\d+).*/;
        const sourceStab = /^\s*\.stabn\s+(\d+),0,(\d+),.*/;
        const stdInLooking = /.*<stdin>|^-$|example\.[^/]+$|<source>/;
        const endBlock = /\.(cfi_endproc|data|text|section)/;
        let source: AsmSource | undefined;

        let inCustomAssembly = 0;
        asmLines.forEach(line => {
            let match;
            if (line.trim() === "") {
                result.push(new AsmLine("", undefined));
                return;
            }

            if (line.match(this.startAppBlock) || line.match(this.startAsmNesting)) {
                inCustomAssembly++;
            } else if (line.match(this.endAppBlock) || line.match(this.endAsmNesting)) {
                inCustomAssembly--;
            }
            match = line.match(sourceTag);
            if (match) {
                const file = files.get(parseInt(match[1]));
                const sourceLine = parseInt(match[2]);
                if (file) {
                    source = new AsmSource(
                        !file.match(stdInLooking) ? file : undefined,
                        sourceLine
                    );
                } else {
                    source = undefined;
                }
            }
            match = line.match(sourceStab);
            if (match) {
                // cf http://www.math.utah.edu/docs/info/stabs_11.html#SEC48
                switch (parseInt(match[1])) {
                    case 68:
                        source = new AsmSource(undefined, parseInt(match[2]));
                        break;
                    case 132:
                    case 100:
                        source = undefined;
                        prevLabel = undefined;
                        break;
                }
            }
            if (line.match(endBlock)) {
                source = undefined;
                prevLabel = undefined;
            }

            if (filter.commentOnly && line.match(commentOnly)) {
                return;
            }

            if (inCustomAssembly > 0) {
                line = this.fixLabelIndentation(line);
            }

            match = line.match(this.labelDef);
            if (!match) {
                match = line.match(this.assignmentDef);
            }

            if (!match) {
                match = line.match(this.cudaBeginDef);
                if (match) {
                    this.inNvccDef = true;
                }
            }
            if (match) {
                // It's a label definition.
                if (!labelsUsed.has(match[1])) {
                    // It's an unused label.
                    if (filter.labels) {
                        return;
                    }
                } else {
                    // A used label.
                    prevLabel = match[0];
                }
            }
            if (this.inNvccDef) {
                if (line.match(this.cudaEndDef)) {
                    this.inNvccDef = false;
                }
            } else if (!match && filter.directives) {
                // Check for directives only if it wasn't a label; the regexp would
                // otherwise misinterpret labels as directives.
                if (line.match(this.dataDefn) && prevLabel) {
                    // We're defining data that's being used somewhere.
                } else {
                    if (line.match(this.directive)) {
                        return;
                    }
                }
            }

            line = expandTabs(line);
            result.push(new AsmLine(this.filterAsmLine(line, filter), this.hasOpcode(line) ? source : undefined));
        });
        return result;
    }

    fixLabelIndentation(line: string) {
        const match = line.match(this.indentedLabelDef);
        if (match) {
            return line.replace(/^\s+/, "");
        } else {
            return line;
        }
    }

    isUserFunction(func: string) {
        if (this.binaryHideFuncRe === undefined) {
            return true;
        }
        return !func.match(this.binaryHideFuncRe);
    }

    processBinaryAsm(asm: string, filter: AsmFilter): AsmLine[] {
        const result: AsmLine[] = [];
        const asmLines = asm.split("\n");
        let source: AsmSource | undefined;
        let func: string | undefined;

        // Handle "error" documents.
        if (asmLines.length === 1 && asmLines[0][0] === '<') {
            return [new AsmLine(asmLines[0], undefined)];
        }

        asmLines.forEach(line => {
            let match = line.match(this.lineRe);
            if (match) {
                source = new AsmSource(match[1], parseInt(match[2]));
                return;
            }

            match = line.match(this.labelRe);
            if (match) {
                func = match[2];
                if (this.isUserFunction(func)) {
                    result.push(new AsmLine(func + ":", undefined));
                }
                return;
            }

            if (!func || !this.isUserFunction(func)) {
                return;
            }

            match = line.match(this.asmOpcodeRe);
            if (match) {
                const address = parseInt(match[1], 16);
                const opcodes = match[2].split(" ").filter(x => !!x).join(' ');
                const disassembly = " " + this.filterAsmLine(match[4], filter);
                result.push(new BinaryAsmLine(disassembly, source, address, opcodes));
            }
        });
        return result;
    }

    process(asm: string, filter: AsmFilter) {
        if (filter.binary) {
            return this.processBinaryAsm(asm, filter);
        } else {
            return this.processAsm(asm, filter);
        }
    }
}
