// Copyright (c) 2015, Compiler Explorer Authors
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

import { splitLines, expandTabs, squashHorizontalWhitespace } from './utils';

export class AsmFilter {
    trim = true;
    binary = false;
    commentOnly = false;
    directives = true;
    labels = true;
}

export class AsmSource {
    file: string | undefined;
    line: number;

    constructor(file: string | undefined, line: number) {
        this.file = file;
        this.line = line;
    }
}

export class AsmLabelRange {
    startCol: number;
    endCol: number;

    constructor(startCol: number, endCol: number) {
        this.startCol = startCol;
        this.endCol = endCol;
    }
}

export class AsmLabel {
    name: string;
    range: AsmLabelRange;

    constructor(name: string, range: AsmLabelRange) {
        this.name = name;
        this.range = range;
    }
}

export class AsmLine {
    text: string;
    source: AsmSource | undefined;
    labels: AsmLabel[];

    constructor(text: string, source: AsmSource | undefined, labels: AsmLabel[]) {
        this.text = text;
        this.source = source;
        this.labels = labels;
    }

    get value(): string {
        return this.text + '\n';
    }
}

export class BinaryAsmLine extends AsmLine {
    address: number;
    opcodes: string;

    constructor(text: string, source: AsmSource | undefined, labels: AsmLabel[], address: number, opcodes: string) {
        super(text, source, labels);
        this.address = address;
        this.opcodes = opcodes;
    }

    get value(): string {
        const address = ('0000000' + this.address.toString(16)).substr(-8);
        return `<${address}> ${this.text}\n`;
    }
}

export class AsmParserResult {
    asm: AsmLine[];
    labelDefinitions: Map<string, number>;

    constructor(asm: AsmLine[], labelDefinitions: Map<string, number>) {
        this.asm = asm;
        this.labelDefinitions = labelDefinitions;
    }
}

export class AsmParser {

    labelDef = /^(?:.proc\s+)?([.a-z_$@][a-z0-9$_@.]*):/i;

    labelFindNonMips = /[.A-Z_a-z][\w$.]*/g;
    // MIPS labels can start with a $ sign, but other assemblers use $ to mean literal.
    labelFindMips = /[$.A-Z_a-z][\w$.]*/g;
    mipsLabelDefinition = /^\$[\w$.]+:/;
    dataDefn = /^\s*\.(string|asciz|ascii|[1248]?byte|short|x?word|long|quad|value|zero)/;
    fileFind = /^\s*\.file\s+(\d+)\s+"([^"]+)"(\s+"([^"]+)")?.*/;
    // Opcode expression here matches LLVM-style opcodes of the form `%blah = opcode`
    hasOpcodeRe = /^\s*(%[$.A-Z_a-z][\w$.]*\s*=\s*)?[A-Za-z]/;
    instructionRe = /^\s*[A-Za-z]+/;
    identifierFindRe = /[$.@A-Z_a-z][\dA-z]*/g;
    hasNvccOpcodeRe = /^\s*[@A-Za-z|]/;
    definesFunction = /^\s*\.(type.*,\s*[#%@]function|proc\s+[.A-Z_a-z][\w$.]*:.*)$/;
    definesGlobal = /^\s*\.(?:globa?l|GLB|export)\s*([.A-Z_a-z][\w$.]*)/;
    definesWeak = /^\s*\.(?:weakext|weak)\s*([.A-Z_a-z][\w$.]*)/;
    indentedLabelDef = /^\s*([$.A-Z_a-z][\w$.]*):/;
    assignmentDef = /^\s*([$.A-Z_a-z][\w$.]*)\s*=/;
    directive = /^\s*\..*$/;
    startAppBlock = /\s*#APP.*/;
    endAppBlock = /\s*#NO_APP.*/;
    startAsmNesting = /\s*# Begin ASM.*/;
    endAsmNesting = /\s*# End ASM.*/;
    cudaBeginDef = /\.(entry|func)\s+(?:\([^)]*\)\s*)?([$.A-Z_a-z][\w$.]*)\($/;
    cudaEndDef = /^\s*\)\s*$/;

    asmOpcodeRe = /^\s*([\da-f]+):\s*(([\da-f]{2} ?)+)\s*(.*)/;
    lineRe = /^(\/[^:]+):(\d+).*/;
    labelRe = /^([\da-f]+)\s+<([^>]+)>:$/;
    destRe = /\s([\da-f]+)\s+<([^+>]+)(\+0x[\da-f]+)?>$/;
    commentRe = /[#;]/;
    instOpcodeRe = /(\.inst\.?\w?)\s*(.*)/;

    binaryHideFuncRe: RegExp | undefined;

    private hasOpcode(line: string, inNvccCode: boolean) {
        // Remove any leading label definition...
        const match = line.match(this.labelDef);
        if (match) {
            line = line.substr(match[0].length);
        }
        // Strip any comments
        line = line.split(this.commentRe, 1)[0];
        // .inst generates an opcode, so also counts
        if (line.match(this.instOpcodeRe)) {
            return true;
        }
        // Detect assignment, that's not an opcode...
        if (line.match(this.assignmentDef)) {
            return false;
        }
        if (inNvccCode) {
            return !!line.match(this.hasNvccOpcodeRe);
        }
        return !!line.match(this.hasOpcodeRe);
    }

    private filterAsmLine(line: string, filter: AsmFilter) {
        if (!filter.trim) {
            return line;
        }
        return squashHorizontalWhitespace(line, true);
    }

    private labelFindFor(asmLines: string[]) {
        const isMips = asmLines.some(line => {
            return !!line.match(this.mipsLabelDefinition);
        });
        return isMips ? this.labelFindMips : this.labelFindNonMips;
    }

    private findUsedLabels(asmLines: string[], filterDirectives: boolean) {
        const labelsUsed = new Set<string>();
        const weakUsages = new Map<string, string[]>();
        const labelFind = this.labelFindFor(asmLines);
        // The current label set is the set of labels all pointing at the current code, so:
        // foo:
        // bar:
        //    add r0, r0, #1
        // in this case [foo, bar] would be the label set for the add instruction.
        let currentLabelSet = new Array<string>();
        let inLabelGroup = false;
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
                if (inLabelGroup) {
                    currentLabelSet.push(match[1]);
                } else {
                    currentLabelSet = [match[1]];
                }
                inLabelGroup = true;
            } else {
                inLabelGroup = false;
            }

            match = line.match(this.definesGlobal);
            if (!match) {
                match = line.match(this.definesWeak);
            }
            if (!match) {
                match = line.match(this.cudaBeginDef);
            }
            if (match) {
                labelsUsed.add(match[1]);
            }

            const definesFunction = line.match(this.definesFunction);
            if (!definesFunction && (!line || line[0] === '.')) {
                return;
            }

            match = line.match(labelFind);
            if (!match) {
                return;
            }

            if (!filterDirectives || this.hasOpcode(line, false) || definesFunction) {
                // Only count a label as used if it's used by an opcode, or else we're not filtering directives.
                match.forEach(label => labelsUsed.add(label));
            } else {
                // If we have a current label, then any subsequent opcode or data definition's labels are referred to
                // weakly by that label.
                const isDataDefinition = !!line.match(this.dataDefn);
                const isOpcode = this.hasOpcode(line, false);
                if (isDataDefinition || isOpcode) {
                    currentLabelSet.forEach(currentLabel => {
                        if (weakUsages.get(currentLabel) === undefined) {
                            weakUsages.set(currentLabel, []);
                        }
                        match!.forEach(label => weakUsages.get(currentLabel)!.push(label));
                    });
                }
            }
        });

        // Now follow the chains of used labels, marking any weak references they refer
        // to as also used. We iteratively do this until either no new labels are found,
        // or we hit a limit (only here to prevent a pathological case from hanging).
        const MaxLabelIterations = 10;
        for (let iter = 0; iter < MaxLabelIterations; ++iter) {
            const toAdd: string[] = [];

            labelsUsed.forEach(label => {
                const labelWeakUsages = weakUsages.get(label);
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

    private parseFiles(asmLines: string[]) {
        const files = new Map<number, string>();

        asmLines.forEach(line => {
            const match = line.match(this.fileFind);
            if (match) {
                const lineNum = parseInt(match[1]);
                if (match[4]) {
                    // Clang-style file directive '.file X "dir" "filename"'
                    files.set(lineNum, match[2] + '/' + match[4]);
                } else {
                    files.set(lineNum, match[2]);
                }
            }
        });

        return files;
    }

    // Remove labels which do not have a definition.
    private removeLabelsWithoutDefinition(astResult: AsmLine[], labelDefinitions: Map<string, number>) {
        astResult.forEach(obj => {
            obj.labels = obj.labels.filter(label => labelDefinitions.get(label.name));
        });
    }

    // Get labels which are used in the given line.
    private getUsedLabelsInLine(line: string) {
        const labelsInLine: AsmLabel[] = [];

        // Strip any comments
        const instruction = line.split(this.commentRe, 1)[0];

        // Remove the instruction.
        const params = instruction.replace(this.instructionRe, '');

        const removedCol = instruction.length - params.length + 1;
        params.replace(this.identifierFindRe, (label, index) => {
            const startCol = removedCol + index;
            labelsInLine.push(new AsmLabel(
                label,
                new AsmLabelRange(startCol, startCol + label.length)
            ));
            return '';
        });

        return labelsInLine;
    }

    private processAsm(asmResult: string, filter: AsmFilter) {
        if (filter.commentOnly) {
            // Remove any block comments that start and end on a line if we're removing comment-only lines.
            const blockComments = /^[\t ]*\/\*(\*(?!\/)|[^*])*\*\/\s*/gm;
            asmResult = asmResult.replace(blockComments, '');
        }

        const asm: AsmLine[] = [];
        const labelDefinitions = new Map<string, number>();
        const asmLines = splitLines(asmResult);

        const labelsUsed = this.findUsedLabels(asmLines, filter.directives);
        const files = this.parseFiles(asmLines);
        let prevLabel: string | undefined = '';

        // Lines matching the following pattern are considered comments:
        // - starts with '#', '@', '//' or a single ';' (non repeated)
        // - starts with ';;' and has non-whitespace before end of line
        const commentOnly = /^\s*(((#|@|\/\/).*)|(\/\*.*\*\/)|(;\s*)|(;[^;].*)|(;;.*\S.*))$/;

        const commentOnlyNvcc = /^\s*(((#|;|\/\/).*)|(\/\*.*\*\/))$/;
        const sourceTag = /^\s*\.loc\s+(\d+)\s+(\d+).*/;
        const sourceD2Tag = /^\s*\.d2line\s+(\d+),?\s*(\d*).*/;
        const source6502Dbg = /^\s*\.dbg\s+line,\s*"([^"]+)",\s*(\d+)/;
        const source6502DbgEnd = /^\s*\.dbg\s+line[^,]/;
        const sourceStab = /^\s*\.stabn\s+(\d+),0,(\d+),.*/;
        const stdInLooking = /.*<stdin>|^-$|example\.[^/]+$|<source>/;
        const endBlock = /\.(cfi_endproc|data|text|section)/;
        let source: AsmSource | undefined;

        function maybeAddBlank() {
            const lastBlank = asm.length === 0 || asm[asm.length - 1].text === '';
            if (!lastBlank) {
                asm.push(new AsmLine('', undefined, []));
            }
        }

        function handleSource(line: string) {
            let match = line.match(sourceTag);
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
            } else {
                match = line.match(sourceD2Tag);
                if (match) {
                    const sourceLine = parseInt(match[1]);
                    source = new AsmSource(
                        undefined,
                        sourceLine,
                    );
                }
            }
        }

        function handleStabs(line: string) {
            const match = line.match(sourceStab);
            if (!match) {
                return;
            }
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

        function handle6502(line: string) {
            const match = line.match(source6502Dbg);
            if (match) {
                const file = match[1];
                const sourceLine = parseInt(match[2]);
                source = new AsmSource(
                    !file.match(stdInLooking) ? file : undefined,
                    sourceLine
                );
            } else if (line.match(source6502DbgEnd)) {
                source = undefined;
            }
        }

        let inNvccDef = false;
        let inNvccCode = false;

        let inCustomAssembly = 0;
        asmLines.forEach(line => {
            if (line.trim() === '') {
                return maybeAddBlank();
            }

            if (line.match(this.startAppBlock) || line.match(this.startAsmNesting)) {
                inCustomAssembly++;
            } else if (line.match(this.endAppBlock) || line.match(this.endAsmNesting)) {
                inCustomAssembly--;
            }

            handleSource(line);
            handleStabs(line);
            handle6502(line);

            if (line.match(endBlock) || (inNvccCode && line.match(/}/))) {
                source = undefined;
                prevLabel = undefined;
            }

            if (filter.commentOnly &&
                ((line.match(commentOnly) && !inNvccCode) ||
                    (line.match(commentOnlyNvcc) && inNvccCode))
            ) {
                return;
            }

            if (inCustomAssembly > 0) {
                line = this.fixLabelIndentation(line);
            }

            let match = line.match(this.labelDef);
            if (!match) {
                match = line.match(this.assignmentDef);
            }

            if (!match) {
                match = line.match(this.cudaBeginDef);
                if (match) {
                    inNvccDef = true;
                    inNvccCode = true;
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
                    labelDefinitions.set(match[1], asm.length + 1);
                }
            }
            if (inNvccDef) {
                if (line.match(this.cudaEndDef)) {
                    inNvccDef = false;
                }
            } else if (!match && filter.directives) {
                // Check for directives only if it wasn't a label; the regexp would
                // otherwise misinterpret labels as directives.
                if (line.match(this.dataDefn) && prevLabel) {
                    // We're defining data that's being used somewhere.
                } else {
                    if (line.match(this.directive) && !line.match(this.instOpcodeRe)) {
                        return;
                    }
                }
            }

            line = expandTabs(line);
            const text = this.filterAsmLine(line, filter);

            const labelsInLine: AsmLabel[] = match ? [] : this.getUsedLabelsInLine(text);

            asm.push(new AsmLine(
                text,
                this.hasOpcode(line, inNvccCode) ? source : undefined,
                labelsInLine
            ));
        });

        this.removeLabelsWithoutDefinition(asm, labelDefinitions);

        return new AsmParserResult(asm, labelDefinitions);
    }

    private fixLabelIndentation(line: string) {
        const match = line.match(this.indentedLabelDef);
        if (match) {
            return line.replace(/^\s+/, '');
        } else {
            return line;
        }
    }

    private isUserFunction(func: string) {
        if (this.binaryHideFuncRe === undefined) {
            return true;
        }
        return !func.match(this.binaryHideFuncRe);
    }

    private processBinaryAsm(asmResult: string, filter: AsmFilter) {
        const asm: AsmLine[] = [];
        const labelDefinitions = new Map<string, number>();

        const asmLines = asmResult.split('\n');
        let source: AsmSource | undefined;
        let func: string | undefined;

        // Handle "error" documents.
        if (asmLines.length === 1 && asmLines[0][0] === '<') {
            return new AsmParserResult(
                [new AsmLine(asmLines[0], undefined, [])],
                labelDefinitions
            );
        }

        asmLines.forEach(line => {
            const labelsInLine: AsmLabel[] = [];

            let match = line.match(this.lineRe);
            if (match) {
                source = new AsmSource(match[1], parseInt(match[2]));
                return;
            }

            match = line.match(this.labelRe);
            if (match) {
                func = match[2];
                if (this.isUserFunction(func)) {
                    asm.push(new AsmLine(func + ':', undefined, labelsInLine));
                    labelDefinitions.set(func, asm.length);
                }
                return;
            }

            if (!func || !this.isUserFunction(func)) {
                return;
            }

            match = line.match(this.asmOpcodeRe);
            if (match) {
                const address = parseInt(match[1], 16);
                const opcodes = match[2].split(' ').filter(x => !!x).join(' ');
                const disassembly = " " + this.filterAsmLine(match[4], filter);
                asm.push(new BinaryAsmLine(disassembly, source, labelsInLine, address, opcodes));
            }
        });

        this.removeLabelsWithoutDefinition(asm, labelDefinitions);

        return new AsmParserResult(asm, labelDefinitions);
    }

    process(asm: string, filter: AsmFilter): AsmParserResult {
        if (filter.binary) {
            return this.processBinaryAsm(asm, filter);
        } else {
            return this.processAsm(asm, filter);
        }
    }
}
